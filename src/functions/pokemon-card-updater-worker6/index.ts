// src/workers/worker1.ts
// Worker N: invoked by the manager; fetches pages and enqueues per-page processing
// to its own single-concurrency queue (one app DB txn + one TS batch per page).

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { syncCardsForPages } from "../../shared/syncCards";
import * as dotenv from "dotenv";
dotenv.config();

// ⚠️ CHANGE THIS NUMBER PER FILE (1..9)
const WORKER_NUM = 6;
const WORKER_ID = `pokemon-card-updater-worker${WORKER_NUM}`;

type SyncRequestBody = { pageStart: number; pageEnd: number };

async function handler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  let body: SyncRequestBody | null = null;
  try {
    body = (await req.json()) as SyncRequestBody;
  } catch {
    return { status: 400, jsonBody: { message: "Invalid JSON body" } };
  }

  const { pageStart, pageEnd } = body ?? ({} as SyncRequestBody);
  if (!Number.isInteger(pageStart) || !Number.isInteger(pageEnd)) {
    return { status: 400, jsonBody: { message: "Missing or invalid pageStart/pageEnd" } };
  }

  const apikey = process.env.X_API_KEY_1;
  if (!apikey) {
    return { status: 500, jsonBody: { message: "X_API_KEY_1 env var missing" } };
  }

  const fn = context.functionName || WORKER_ID;
  console.log(`🧪 [${WORKER_ID}] received range ${pageStart}–${pageEnd} (fn=${fn})`);
  console.log(`🔑 Using API key (masked): ${apikey.slice(0, 6)}***`);

  // Fire-and-forget: enqueue all page jobs; the worker's queue runs with concurrency=1
  void (async () => {
    try {
      await syncCardsForPages(WORKER_ID, pageStart, pageEnd, apikey);
      console.log(`✅ [${WORKER_ID}] Finished pages ${pageStart}–${pageEnd}`);
    } catch (err: any) {
      console.error(`❌ [${WORKER_ID}] Error processing ${pageStart}–${pageEnd}:`, err?.message ?? err);
    }
  })();

  return { status: 202, jsonBody: { message: `Worker ${WORKER_NUM} started for pages ${pageStart}–${pageEnd}` } };
}

app.http(WORKER_ID, {
  methods: ["POST"],
  authLevel: "function",
  handler,
});
