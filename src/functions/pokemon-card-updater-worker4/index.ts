// Worker file: invoked by the manager to update Pokémon cards for a specific range of pages.
// Fire-and-forget: we enqueue the work and return 202 immediately.

import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { syncCardsForPages } from "../../shared/syncCards";
import * as dotenv from "dotenv";

dotenv.config();

type SyncRequestBody = {
  pageStart: number;
  pageEnd: number;
};

async function handler(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
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

  const apikey = process.env.X_API_KEY_4;
  if (!apikey) {
    return { status: 500, jsonBody: { message: "X_API_KEY_4 env var missing" } };
  }

  console.log(`🧪 worker4 received range ${pageStart}–${pageEnd}`);
  console.log(`🔑 Using API key (masked): ${apikey.slice(0, 6)}***`);

  // FIRE-AND-FORGET:
  // Enqueue page jobs inside syncCardsForPages; do not await it.
  // All logging inside the background work MUST be console.log only.
  void (async () => {
    try {
      await syncCardsForPages(pageStart, pageEnd, null, apikey);
      console.log(`✅ Finished pages ${pageStart}–${pageEnd}`);
    } catch (err: any) {
      console.error(`❌ Error processing pages ${pageStart}–${pageEnd}:`, err?.message ?? err);
    }
  })();

  // Return immediately so HTTP connection closes and no Azure context is used afterward
  return { status: 202, jsonBody: { message: `Worker started for pages ${pageStart}–${pageEnd}` } };
}

app.http("pokemon-card-updater-worker4", {
  methods: ["POST"],
  authLevel: "function",
  handler,
});
