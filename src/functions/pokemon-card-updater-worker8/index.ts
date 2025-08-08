import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { syncCardsForPages } from "../../shared/syncCards";

import * as dotenv from "dotenv";

dotenv.config();

type SyncRequestBody = {
  pageStart: number;
  pageEnd: number;
};

export async function httpTrigger(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const { pageStart, pageEnd } = (await request.json()) as SyncRequestBody;

  if (typeof pageStart !== "number" || typeof pageEnd !== "number") {
    return {
      status: 400,
      jsonBody: { message: "Missing or invalid pageStart/pageEnd" },
    };
  }

  try {
    const apikey = process.env.X_API_KEY_8;
    if (!apikey) {
      throw new Error("X_API_KEY_8 environment variable is not set");
    }

    context.log(`🔑 Using API key: ${apikey}`);

    const result = await syncCardsForPages(pageStart, pageEnd, context, apikey);
    return {
      status: 200,
      jsonBody: {
        message: `Successfully processed pages ${result.pageStart} to ${result.pageEnd}`,
        totalCards: result.totalCards,
      },
    };
  } catch (error: any) {
    context.error("❌ Error syncing pages:", error);
    return {
      status: 500,
      jsonBody: {
        message: "Failed to process pages",
        error: error.message,
      },
    };
  }
}

app.http("pokemon-card-updater-worker8", {
  methods: ["POST"],
  authLevel: "function",
  handler: httpTrigger,
});
