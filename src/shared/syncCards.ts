// src/shared/syncCards.ts
import { fetchPage } from "./fetchCards";
import { processCard } from "./processCard";
import { pageProcessingQueue } from "./pageQueue";

type SyncResult = {
  success: true;
  totalCards: number;
  pageStart: number;
  pageEnd: number;
};

// FIRE-AND-FORGET: returns immediately after enqueuing page jobs
export async function syncCardsForPages(
  startPage: number,
  endPage: number,
  _context: unknown,         // not used (no context.log)
  apikey: string
): Promise<SyncResult> {
  if (startPage < 1 || endPage < startPage) {
    throw new Error(`Invalid page range: ${startPage} to ${endPage}`);
  }
  if (!apikey) throw new Error("X_API_KEY env var is not set");

  console.log(`⬇️ Sync (fire-and-forget) pages ${startPage} → ${endPage}`);

  let totalCards = 0;

  for (let page = startPage; page <= endPage; page++) {
    // Fetch page
    const data = await fetchPage({}, page, apikey);
    const { data: cards } = data;
    totalCards += cards.length;
    console.log(`📦 Fetched page ${page} with ${cards.length} cards`);

    // Enqueue page job (do not await). Queue runs up to 25 pages concurrently.
    void pageProcessingQueue.push(async () => {
      try {
        console.log(`🧩 Processing page ${page}...`);
        for (const card of cards) {
          // Keep one-card-at-a-time behavior
          await processCard(card);
        }
        // Help GC: drop large array reference
        (cards as any[]).length = 0;
        console.log(`✅ Done page ${page}`);
      } catch (e) {
        console.error(`❌ Page ${page} processing failed`, e);
      }
    });

    // Immediately continue to fetch next page
  }

  console.log(`ℹ️ Enqueued all page jobs for ${startPage}–${endPage}; returning 202-style.`);
  return { success: true, totalCards, pageStart: startPage, pageEnd: endPage };
}
