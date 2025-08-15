import { app, InvocationContext, Timer } from "@azure/functions";
import * as dotenv from "dotenv";
import { PrismaClient as TsClient } from "@prisma/ts-client";

dotenv.config();

// -------- Config (tunable) --------
const DAILY_KEEP_DAYS   = Number(process.env.ROLLUP_DAYS   ?? 7);    // last N full days (excl. today)
const WEEKLY_KEEP_WEEKS = Number(process.env.ROLLUP_WEEKS  ?? 4);    // last N full ISO weeks (excl. current)
const MONTHLY_KEEP_MO   = Number(process.env.ROLLUP_MONTHS ?? 12);   // last N full months (excl. current)
const DELETE_BATCH      = Number(process.env.ROLLUP_DELETE_BATCH ?? 20000); // rows per batch
// Optional: delete everything older than last N full years (excl. current year).
// If unset or invalid, terminal retention is skipped and yearly rows persist.
const RETAIN_YEARS      = process.env.RETAIN_YEARS != null
  ? Number(process.env.RETAIN_YEARS)
  : NaN;

const prismaTimescale = new TsClient();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetries<T>(fn: () => Promise<T>, label: string, retries = 4, baseDelayMs = 500): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (err: any) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = Math.round(baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random()));
      console.warn(`[rollup] ${label} failed (attempt ${attempt + 1}/${retries + 1}). Retry in ${delay}ms:`, err?.message ?? err);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// Helpful indexes (idempotent; no schema change)
const OPTIMIZATION_STATEMENTS = [
  `CREATE INDEX IF NOT EXISTS idx_pricehistory_cardid_time
     ON "PriceHistory" ("cardId", "time" DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_pricehistory_time
     ON "PriceHistory" ("time" DESC);`,
];

// Singleton lock
const ACQUIRE_LOCK_SQL = `SELECT pg_try_advisory_lock(hashtextextended('pricehistory_rollup', 0)) AS locked;`;
const RELEASE_LOCK_SQL = `SELECT pg_advisory_unlock(hashtextextended('pricehistory_rollup', 0));`;

// Batched delete runner
async function deleteInBatches(sqlProducer: () => string, label: string) {
  let total = 0;
  while (true) {
    const sql = sqlProducer();
    const deleted: number = await withRetries(
      () => prismaTimescale.$executeRawUnsafe(sql),
      `${label}_batch`
    );
    total += deleted;
    if (!deleted || deleted < DELETE_BATCH) break;
  }
  console.log(`[rollup] ${label}: deleted ${total} rows`);
}

// Build SQL with a single time snapshot (no drift across midnight)
function buildSQL(nowIso: string) {
  const NOW = `'${nowIso}'::timestamptz`;

  // DAILY: keep latest per day in last N full days (excl. today)
  const sqlDailyBatch = () => `
  WITH doomed AS (
    SELECT ctid FROM (
      SELECT ctid, ROW_NUMBER() OVER (
        PARTITION BY "cardId", date_trunc('day', "time")
        ORDER BY "time" DESC
      ) rn
      FROM "PriceHistory"
      WHERE "time" >= (date_trunc('day', ${NOW}) - INTERVAL '${DAILY_KEEP_DAYS} days')
        AND "time"  <  date_trunc('day', ${NOW})
    ) s
    WHERE rn > 1
    LIMIT ${DELETE_BATCH}
  )
  DELETE FROM "PriceHistory" WHERE ctid IN (SELECT ctid FROM doomed);`;

  // WEEKLY: keep latest per ISO week in last N full weeks (excl. current),
  // but do NOT touch rows inside the last DAILY window (protected).
  const sqlWeeklyBatch = () => `
  WITH doomed AS (
    SELECT ctid FROM (
      SELECT ctid, ROW_NUMBER() OVER (
        PARTITION BY "cardId", date_trunc('week', "time")
        ORDER BY "time" DESC
      ) rn
      FROM "PriceHistory"
      WHERE "time" >= (date_trunc('week', ${NOW}) - INTERVAL '${WEEKLY_KEEP_WEEKS} weeks')
        AND "time"  <  date_trunc('week', ${NOW})
        AND "time"  <  (date_trunc('day', ${NOW}) - INTERVAL '${DAILY_KEEP_DAYS} days')
    ) s
    WHERE rn > 1
    LIMIT ${DELETE_BATCH}
  )
  DELETE FROM "PriceHistory" WHERE ctid IN (SELECT ctid FROM doomed);`;

  // MONTHLY: keep latest per month in last N full months (excl. current),
  // but do NOT touch rows inside the last WEEKLY window (protected).
  const sqlMonthlyBatch = () => `
  WITH doomed AS (
    SELECT ctid FROM (
      SELECT ctid, ROW_NUMBER() OVER (
        PARTITION BY "cardId", date_trunc('month', "time")
        ORDER BY "time" DESC
      ) rn
      FROM "PriceHistory"
      WHERE "time" >= (date_trunc('month', ${NOW}) - INTERVAL '${MONTHLY_KEEP_MO} months')
        AND "time"  <  date_trunc('month', ${NOW})
        AND "time"  <  (date_trunc('week', ${NOW}) - INTERVAL '${WEEKLY_KEEP_WEEKS} weeks')
    ) s
    WHERE rn > 1
    LIMIT ${DELETE_BATCH}
  )
  DELETE FROM "PriceHistory" WHERE ctid IN (SELECT ctid FROM doomed);`;

  // YEARLY: beyond the monthly window, keep latest per year
  const sqlYearlyBatch = () => `
  WITH doomed AS (
    SELECT ctid FROM (
      SELECT ctid, ROW_NUMBER() OVER (
        PARTITION BY "cardId", date_trunc('year', "time")
        ORDER BY "time" DESC
      ) rn
      FROM "PriceHistory"
      WHERE "time" < (date_trunc('month', ${NOW}) - INTERVAL '${MONTHLY_KEEP_MO} months')
    ) s
    WHERE rn > 1
    LIMIT ${DELETE_BATCH}
  )
  DELETE FROM "PriceHistory" WHERE ctid IN (SELECT ctid FROM doomed);`;

  // TERMINAL RETENTION: hard delete anything older than last RETAIN_YEARS full years (optional)
  // e.g., RETAIN_YEARS=5 on 2025-08-14 keeps >= 2020-01-01, deletes < 2020-01-01.
  const sqlTerminalRetentionBatch = (retainYears: number) => `
  WITH doomed AS (
    SELECT ctid
    FROM "PriceHistory"
    WHERE "time" < (date_trunc('year', ${NOW}) - INTERVAL '${retainYears} years')
    LIMIT ${DELETE_BATCH}
  )
  DELETE FROM "PriceHistory" WHERE ctid IN (SELECT ctid FROM doomed);`;

  return { sqlDailyBatch, sqlWeeklyBatch, sqlMonthlyBatch, sqlYearlyBatch, sqlTerminalRetentionBatch };
}

async function setSessionTimeouts() {
  // Important: run as SEPARATE statements; Prisma/Postgres disallow multi-statement prepared queries.
  await withRetries(() => prismaTimescale.$executeRawUnsafe(`SET statement_timeout = '15min'`), "SET statement_timeout");
  await withRetries(() => prismaTimescale.$executeRawUnsafe(`SET lock_timeout = '5s'`), "SET lock_timeout");
}

export async function runRollups(context: InvocationContext) {
  console.log("[rollup] start");

  if (!process.env.TIMESCALE_URL) {
    context.error("[rollup] No TIMESCALE_URL found in environment!");
    throw new Error("TIMESCALE_URL is required");
  }

  // Optional: explicitly connect (safe to call even if already connected)
  await prismaTimescale.$connect().catch(() => {});

  // Safety timeouts (split into two single statements)
  await setSessionTimeouts();

  // Sanity ping (use queryRaw for SELECT)
  console.log("[rollup] sanity ping...");
  await withRetries(() => prismaTimescale.$queryRawUnsafe(`SELECT 1`), "sanity SELECT 1");
  console.log("[rollup] sanity ping successful.");

  // Ensure helpful indexes
  console.log("[rollup] ensuring indexes...");
  for (const stmt of OPTIMIZATION_STATEMENTS) {
    await withRetries(() => prismaTimescale.$executeRawUnsafe(stmt), "ensure_index");
  }
  console.log("[rollup] indexes ensured.");

  // Acquire advisory lock (singleton)
  const lockRows = await withRetries(
    () => prismaTimescale.$queryRawUnsafe<{ locked: boolean }[]>(ACQUIRE_LOCK_SQL),
    "acquire_lock"
  );
  const locked = !!lockRows?.[0]?.locked;
  if (!locked) { console.warn("[rollup] another rollup is running, exiting."); return; }

  try {
    // Fixed snapshot for this run
    const nowIso = new Date().toISOString();
    const { sqlDailyBatch, sqlWeeklyBatch, sqlMonthlyBatch, sqlYearlyBatch, sqlTerminalRetentionBatch } = buildSQL(nowIso);

    console.log("[rollup] applying rollups (protected, batched)...");
    await deleteInBatches(sqlDailyBatch,   "DAILY");
    await deleteInBatches(sqlWeeklyBatch,  "WEEKLY");
    await deleteInBatches(sqlMonthlyBatch, "MONTHLY");
    await deleteInBatches(sqlYearlyBatch,  "YEARLY");

    // Optional terminal retention (delete very old yearly points)
    if (!Number.isNaN(RETAIN_YEARS) && RETAIN_YEARS > 0) {
      await deleteInBatches(() => sqlTerminalRetentionBatch(RETAIN_YEARS), "RETENTION");
    }

    await withRetries(() => prismaTimescale.$executeRawUnsafe(`ANALYZE "PriceHistory"`), "ANALYZE");
    console.log("[rollup] all rollups completed.");
  } finally {
    await prismaTimescale.$executeRawUnsafe(RELEASE_LOCK_SQL).catch(() => {});
  }
}

export async function timerHandler(_: Timer, context: InvocationContext) {
  try {
    await runRollups(context);
  } catch (err: any) {
    context.error("[rollup] FAILED:", err?.message ?? err);
    throw err;
  } finally {
    await prismaTimescale.$disconnect().catch(() => {});
  }
}

// 02:45 daily (15 minutes before the day's second upsert)
app.timer("priceHistoryRollup", {
  schedule: "0 45 2 * * *",
  handler: timerHandler,
});
