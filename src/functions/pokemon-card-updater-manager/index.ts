// Manager file, it invokes the worker functions to update Pokémon cards in parallel.
import { app, InvocationContext, Timer } from "@azure/functions";
import axios from "axios";

import * as dotenv from "dotenv";

dotenv.config();

const totalPageCount = async (): Promise<number> => {
  const maxRetries = 30;
  const retryDelayMs = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 Getting total page count (attempt ${attempt}/${maxRetries})`);
      const res = await axios.get("https://api.pokemontcg.io/v2/cards", {
        headers: { "X-Api-Key": process.env.X_API_KEY_1 || "" },
        params: { page: 1, pageSize: 1 },
        timeout: 180000,
      });

      const totalCount = (res.data as any).totalCount;

      if (!totalCount) {
        throw new Error(`No totalCount field in response (status ${res.status})`);
      }

      console.log(`🌐 Total page count: ${Math.ceil(totalCount / 250)} pages.`);
      return Math.ceil(totalCount / 250);
    } catch (err: any) {
      console.warn(`⚠️ Failed to get total page count (attempt ${attempt}/${maxRetries}): ${err.message}`);

      if (attempt === maxRetries) throw err;

      console.log(`⏳ Waiting ${retryDelayMs / 1000} seconds before retry...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error("totalPageCount retries exhausted");
};

const postToWorker = async (url: string, body: any) => {
  try {
    await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 5000,
    });
    console.log(`✅ Sent to ${url}`);
  } catch (err: any) {
    console.error(`❌ Error posting to ${url}:`, err.message);
  }
};

export async function timerHandler(_: Timer, context: InvocationContext): Promise<void> {
  console.log("Timer triggered manager started");

  const totalPages = await totalPageCount();

  const baseUrl = process.env.FUNCTION_BASE_URL || "";
  const workers = Array.from({ length: 9 }, (_, i) =>
    `${baseUrl}/pokemon-card-updater-worker${i + 1}`
  );

  const pagesPerWorker = Math.floor(totalPages / workers.length);
  const extra = totalPages % workers.length;

  workers.forEach((url, i) => {
    const extraPage = i < extra ? 1 : 0;
    const start = i * pagesPerWorker + Math.min(i, extra) + 1;
    const end = start + pagesPerWorker - 1 + extraPage;
    postToWorker(url, { pageStart: start, pageEnd: end });
  });
}

app.timer("pokemonCardUpdaterManager", {
  schedule: "0 0 */3 * * *",
  handler: timerHandler,
});

app.http("pokemonCardUpdaterManual", {
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async (req, context) => {
    console.log("🔥 Manual HTTP trigger fired");

    const mockTimer: Timer = {
      schedule: {
        adjustForDST: true,
      },
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
