// src/manager/index.ts
import { app, InvocationContext, Timer } from "@azure/functions";
import axios from "axios";
import * as dotenv from "dotenv";
dotenv.config();

async function totalPageCount(apiKey: string): Promise<number> {
  const maxRetries = 6;
  let delay = 1500;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 Getting total page count (attempt ${attempt}/${maxRetries})`);
      const res = await axios.get("https://api.pokemontcg.io/v2/cards", {
        headers: { "X-Api-Key": apiKey },
        params: { page: 1, pageSize: 1 },
        timeout: 60_000,
      });
      const totalCount = (res.data as any).totalCount;
      if (!totalCount) throw new Error(`No totalCount in response`);
      const pages = Math.ceil(totalCount / 250);
      console.log(`🌐 Total page count: ${pages} pages.`);
      return pages;
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      console.warn(`⚠️ totalPageCount failed: ${err?.message ?? err} (retrying in ${delay}ms)`);
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 8000);
    }
  }
  throw new Error("unreachable");
}

async function postToWorker(url: string, body: any) {
  try {
    await axios.post(url, body, { headers: { "Content-Type": "application/json" }, timeout: 10_000 });
    console.log(`✅ Sent to ${url} (202)`);
  } catch (err: any) {
    console.error(`❌ Error posting to ${url}:`, err?.message ?? err);
  }
}

export async function timerHandler(_: Timer, _context: InvocationContext): Promise<void> {
  const baseUrl = process.env.FUNCTION_BASE_URL || "http://localhost:7071/api";
  const apiKey = process.env.X_API_KEY_1 || "";
  if (!apiKey) throw new Error("X_API_KEY_1 missing");

  const totalPages = await totalPageCount(apiKey);
  const workerUrls = Array.from({ length: 9 }, (_, i) => `${baseUrl}/pokemon-card-updater-worker${i + 1}`);

  const pagesPerWorker = Math.floor(totalPages / workerUrls.length);
  const extra = totalPages % workerUrls.length;

  workerUrls.forEach((url, i) => {
    const extraPage = i < extra ? 1 : 0;
    const start = i * pagesPerWorker + Math.min(i, extra) + 1;
    const end = start + pagesPerWorker - 1 + extraPage;
    postToWorker(url, { pageStart: start, pageEnd: end });
  });
  console.log("🟢 Manager dispatch complete");
}

app.timer("pokemonCardUpdaterManager", {
  schedule: "0 0 */3 * * *",
  handler: timerHandler,
});

app.http("pokemonCardUpdaterManual", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (_req, context) => {
    console.log("🔥 Manual HTTP trigger fired");
    const mockTimer: Timer = {
      schedule: { adjustForDST: true },
      scheduleStatus: {
        last: new Date().toISOString(),
        next: new Date(Date.now() + 3600000).toISOString(),
        lastUpdated: new Date().toISOString(),
      },
      isPastDue: false,
    };
    await timerHandler(mockTimer, context);
    return { status: 200, body: "Updater triggered manually" };
  },
});
