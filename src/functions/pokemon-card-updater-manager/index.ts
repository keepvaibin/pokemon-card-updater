import { app, InvocationContext, Timer } from "@azure/functions";
import axios from "axios";

import * as dotenv from "dotenv";

dotenv.config();

const totalPageCount = async (): Promise<number> => {
  const res = await axios.get("https://api.pokemontcg.io/v2/cards", {
    headers: { "X-Api-Key": process.env.X_API_KEY_1 || "" },
    params: { page: 1, pageSize: 1 },
    timeout: 180000,
  });
  return Math.ceil(res.data.totalCount / 250);
};

const postToWorker = async (url: string, body: any) => {
  try {
    await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 3600000,
    });
    console.log(`✅ Sent to ${url}`);
  } catch (err: any) {
    console.error(`❌ Error posting to ${url}:`, err.message);
  }
};

export async function timerHandler(_: Timer, context: InvocationContext): Promise<void> {
  context.log("Timer triggered manager started");

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
    context.log("🔥 Manual HTTP trigger fired");

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
