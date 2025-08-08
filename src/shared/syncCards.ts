import { fetchCardRange } from "./fetchCards";
import { processCard } from "./processCard";
import { InvocationContext } from "@azure/functions";

import * as dotenv from "dotenv";

dotenv.config();

type SyncResult = {
  success: true;
  totalCards: number;
  pageStart: number;
  pageEnd: number;
};


export async function syncCardsForPages(
  startPage: number,
  endPage: number,
  context: InvocationContext,
  apikey: string
): Promise<SyncResult> {
  if (startPage < 1 || endPage < startPage) {
    throw new Error(`Invalid page range: ${startPage} to ${endPage}`);
  }

  context.log(`⬇️ Syncing cards from pages ${startPage} to ${endPage}...`);

  if (!apikey) {
    throw new Error("X_API_KEY environment variable is not set");
  }
  

  const { cards } = await fetchCardRange(startPage, endPage, apikey);

  context.log(`📦 Processing ${cards.length} cards...`);

  for (const card of cards) {
    await processCard(card, context);
  }

  context.log(`✅ Sync complete: ${cards.length} cards (pages ${startPage}-${endPage})`);

  return {
    success: true,
    totalCards: cards.length,
    pageStart: startPage,
    pageEnd: endPage,
  };
}
