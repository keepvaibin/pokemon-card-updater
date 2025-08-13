// src/shared/syncCards.ts
import { fetchPage } from "./fetchCards";
import { processPage } from "./processCard";
import { getWorkerQueue } from "./queueRegistry";

type SyncResult = { success: true; totalCards: number; pageStart: number; pageEnd: number };

export async function syncCardsForPages(
  workerId: string,
  startPage: number,
  endPage: number,
  apikey = process.env.POKEMON_TCG_API_KEY as string
): Promise<SyncResult> {
  if (!workerId) throw new Error("syncCardsForPages: workerId is required");
  if (!apikey) throw new Error("Missing POKEMON_TCG_API_KEY");
  if (!Number.isFinite(startPage) || !Number.isFinite(endPage) || startPage < 1 || endPage < startPage) {
    throw new Error(`Invalid page range: ${startPage}–${endPage}`);
  }

  const queue = getWorkerQueue(workerId);
  const jobs: Promise<any>[] = [];
  let totalCards = 0;

  console.log(`🧪 [${workerId}] Fetching pages ${startPage}–${endPage} (combined queue)`);

  for (let page = startPage; page <= endPage; page++) {
    try {
      console.log(`🧩 [${workerId}] Fetch page ${page}...`);
      const data = await fetchPage({}, page, apikey);
      const cards = data?.data ?? data?.cards ?? [];
      totalCards += cards.length;
      console.log(`📦 [${workerId}] Page ${page}: ${cards.length} cards fetched`);

      const job = queue.push(async () => {
        try {
          console.log(`⚙️  [${workerId}] Process page ${page} (app txn + TS batch)`);
          await processPage(cards, workerId);
          console.log(`✅ [${workerId}] Done page ${page}`);
        } catch (err: any) {
          console.error(`❌ [${workerId}] Page ${page} failed: ${err?.message ?? err}`);
        } finally {
          (cards as any[]).length = 0;
        }
      });

      jobs.push(job);
    } catch (err: any) {
      console.error(`❌ [${workerId}] Fetch page ${page} failed: ${err?.message ?? err}`);
    }
  }

  await Promise.allSettled(jobs);
  console.log(`🎉 [${workerId}] Finished pages ${startPage}–${endPage}`);
  return { success: true, totalCards, pageStart: startPage, pageEnd: endPage };
}
