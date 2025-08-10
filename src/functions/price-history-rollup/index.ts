// src/functions/price-history-rollup/index.ts
import { app, InvocationContext, Timer } from "@azure/functions";
import * as dotenv from "dotenv";
import { PrismaClient as TsClient } from "@prisma/ts-client";

dotenv.config();

// --- Prisma client pointed ONLY at Timescale (price_tracking) ---
const prismaTimescale = new TsClient();

// --- Small retry helper (exponential backoff + jitter) ---
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function withRetries<T>(
  fn: () => Promise<T>,
  label: string,
  retries = 4,
  baseDelayMs = 500
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = Math.round(baseDelayMs * Math.pow(2, attempt) * (0.5 + Math.random()));
      console.warn(
        `[rollup] ${label} failed (attempt ${attempt + 1}/${retries + 1}). Retry in ${delay}ms:`,
        err?.message ?? err
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

// --- DDL: create rollup tables + indexes ---
const CREATE_TABLE_DAILY = `
  CREATE TABLE IF NOT EXISTS price_history_daily (
    "cardId" TEXT NOT NULL,
    bucket   TIMESTAMPTZ NOT NULL,
    last_price DOUBLE PRECISION,
    PRIMARY KEY ("cardId", bucket)
  );
`;
const CREATE_TABLE_3D = `
  CREATE TABLE IF NOT EXISTS price_history_3d (
    "cardId" TEXT NOT NULL,
    bucket   TIMESTAMPTZ NOT NULL,
    last_price DOUBLE PRECISION,
    PRIMARY KEY ("cardId", bucket)
  );
`;
const CREATE_TABLE_MONTHLY = `
  CREATE TABLE IF NOT EXISTS price_history_monthly (
    "cardId" TEXT NOT NULL,
    bucket   TIMESTAMPTZ NOT NULL,
    last_price DOUBLE PRECISION,
    PRIMARY KEY ("cardId", bucket)
  );
`;
const CREATE_TABLE_6M = `
  CREATE TABLE IF NOT EXISTS price_history_6m (
    "cardId" TEXT NOT NULL,
    bucket   TIMESTAMPTZ NOT NULL,
    last_price DOUBLE PRECISION,
    PRIMARY KEY ("cardId", bucket)
  );
`;

const CREATE_INDEXES = [
  `CREATE INDEX IF NOT EXISTS phd_bucket_idx  ON price_history_daily (bucket);`,
  `CREATE INDEX IF NOT EXISTS ph3d_bucket_idx ON price_history_3d (bucket);`,
  `CREATE INDEX IF NOT EXISTS phm_bucket_idx  ON price_history_monthly (bucket);`,
  `CREATE INDEX IF NOT EXISTS ph6m_bucket_idx ON price_history_6m (bucket);`,
];

// --- UPSERT rollups (window function for last-in-bucket). Ignores NULL prices. ---
const UPSERT_DAILY = `
  INSERT INTO price_history_daily ("cardId", bucket, last_price)
  SELECT "cardId", bucket, "averageSellPrice"
  FROM (
    WITH base AS (
      SELECT "cardId",
             time_bucket('1 day', "time") AS bucket,
             "time", "averageSellPrice"
      FROM "PriceHistory"
      WHERE "time" >= now() - interval '35 days'
        AND "averageSellPrice" IS NOT NULL
    ),
    ranked AS (
      SELECT "cardId", bucket, "averageSellPrice",
             ROW_NUMBER() OVER (PARTITION BY "cardId", bucket ORDER BY "time" DESC) rn
      FROM base
    )
    SELECT "cardId", bucket, "averageSellPrice" FROM ranked WHERE rn = 1
  ) s
  ON CONFLICT ("cardId", bucket) DO UPDATE
  SET last_price = EXCLUDED.last_price;
`;

const UPSERT_3D = `
  INSERT INTO price_history_3d ("cardId", bucket, last_price)
  SELECT "cardId", bucket, "averageSellPrice"
  FROM (
    WITH base AS (
      SELECT "cardId",
             time_bucket('3 days', "time") AS bucket,
             "time", "averageSellPrice"
      FROM "PriceHistory"
      WHERE "time" >= now() - interval '110 days'
        AND "averageSellPrice" IS NOT NULL
    ),
    ranked AS (
      SELECT "cardId", bucket, "averageSellPrice",
             ROW_NUMBER() OVER (PARTITION BY "cardId", bucket ORDER BY "time" DESC) rn
      FROM base
    )
    SELECT "cardId", bucket, "averageSellPrice" FROM ranked WHERE rn = 1
  ) s
  ON CONFLICT ("cardId", bucket) DO UPDATE
  SET last_price = EXCLUDED.last_price;
`;

const UPSERT_MONTHLY = `
  INSERT INTO price_history_monthly ("cardId", bucket, last_price)
  SELECT "cardId", bucket, "averageSellPrice"
  FROM (
    WITH base AS (
      SELECT "cardId",
             date_trunc('month', "time") AS bucket,
             "time", "averageSellPrice"
      FROM "PriceHistory"
      WHERE "time" >= now() - interval '4 years'
        AND "averageSellPrice" IS NOT NULL
    ),
    ranked AS (
      SELECT "cardId", bucket, "averageSellPrice",
             ROW_NUMBER() OVER (PARTITION BY "cardId", bucket ORDER BY "time" DESC) rn
      FROM base
    )
    SELECT "cardId", bucket, "averageSellPrice" FROM ranked WHERE rn = 1
  ) s
  ON CONFLICT ("cardId", bucket) DO UPDATE
  SET last_price = EXCLUDED.last_price;
`;

const UPSERT_6M = `
  INSERT INTO price_history_6m ("cardId", bucket, last_price)
  SELECT "cardId", bucket, "averageSellPrice"
  FROM (
    WITH base AS (
      SELECT "cardId",
             time_bucket('6 months', "time") AS bucket,
             "time", "averageSellPrice"
      FROM "PriceHistory"
      WHERE "averageSellPrice" IS NOT NULL
    ),
    ranked AS (
      SELECT "cardId", bucket, "averageSellPrice",
             ROW_NUMBER() OVER (PARTITION BY "cardId", bucket ORDER BY "time" DESC) rn
      FROM base
    )
    SELECT "cardId", bucket, "averageSellPrice" FROM ranked WHERE rn = 1
  ) s
  ON CONFLICT ("cardId", bucket) DO UPDATE
  SET last_price = EXCLUDED.last_price;
`;

// --- PRUNE (run AFTER rollups). Monthly & 6m kept forever. ---
const PRUNE_STATEMENTS = [
  `DELETE FROM "PriceHistory" WHERE "time" < now() - interval '48 hours';`,
  `DELETE FROM price_history_daily   WHERE bucket < date_trunc('day',   now()) - interval '30 days';`,
  `DELETE FROM price_history_3d      WHERE bucket < date_trunc('day',   now()) - interval '90 days';`,
];

export async function runRollups(context: InvocationContext) {
  console.log("[rollup] start");
  console.log(`[rollup] Using TIMESCALE_URL: ${process.env.TIMESCALE_URL}`);

  if (!process.env.TIMESCALE_URL) {
    context.error("[rollup] No TIMESCALE_URL found in environment!");
    throw new Error("TIMESCALE_URL is required");
  }

  console.log("[rollup] Sanity ping...");
  await withRetries(
    () => prismaTimescale.$executeRawUnsafe(`SELECT 1;`),
    "sanity SELECT 1"
  );
  console.log("[rollup] Sanity ping successful.");

  // 1) Ensure tables & indexes exist
  console.log("[rollup] Creating/ensuring rollup tables...");
  await withRetries(() => prismaTimescale.$executeRawUnsafe(CREATE_TABLE_DAILY),   "CREATE_TABLE_DAILY");
  await withRetries(() => prismaTimescale.$executeRawUnsafe(CREATE_TABLE_3D),      "CREATE_TABLE_3D");
  await withRetries(() => prismaTimescale.$executeRawUnsafe(CREATE_TABLE_MONTHLY), "CREATE_TABLE_MONTHLY");
  await withRetries(() => prismaTimescale.$executeRawUnsafe(CREATE_TABLE_6M),      "CREATE_TABLE_6M");

  for (const [i, stmt] of CREATE_INDEXES.entries()) {
    console.log(`[rollup] Creating index ${i}...`);
    await withRetries(() => prismaTimescale.$executeRawUnsafe(stmt), `CREATE_INDEX_${i}`);
    console.log(`[rollup] Index ${i} created.`);
  }

  // 2) Upsert rollups
  console.log("[rollup] Upserting daily rollups...");
  await withRetries(() => prismaTimescale.$executeRawUnsafe(UPSERT_DAILY), "UPSERT_DAILY");

  console.log("[rollup] Upserting 3-day rollups...");
  await withRetries(() => prismaTimescale.$executeRawUnsafe(UPSERT_3D), "UPSERT_3D");

  console.log("[rollup] Upserting monthly rollups...");
  await withRetries(() => prismaTimescale.$executeRawUnsafe(UPSERT_MONTHLY), "UPSERT_MONTHLY");

  console.log("[rollup] Upserting 6-month rollups...");
  await withRetries(() => prismaTimescale.$executeRawUnsafe(UPSERT_6M), "UPSERT_6M");

  // 3) Prune older tiers AFTER rollups
  console.log("[rollup] Pruning old data...");
  for (const [i, stmt] of PRUNE_STATEMENTS.entries()) {
    console.log(`[rollup] Pruning step ${i}...`);
    await withRetries(() => prismaTimescale.$executeRawUnsafe(stmt), `PRUNE_${i}`);
    console.log(`[rollup] Prune step ${i} done.`);
  }

  console.log("[rollup] done");
}

export async function timerHandler(_: Timer, context: InvocationContext) {
  try {
    await runRollups(context);
  } catch (err: any) {
    context.error("[rollup] FAILED:", err?.message ?? err);
    throw err; // let Azure retry/alert if configured
  } finally {
    await prismaTimescale.$disconnect().catch(() => {});
  }
}

// Run 10 minutes after each 3-hour boundary so it follows your ingest job
app.timer("priceHistoryRollup", {
  schedule: "0 10 */3 * * *", // sec min hour dom mon dow → 00:10, 03:10, 06:10, ...
  handler: timerHandler,
});
