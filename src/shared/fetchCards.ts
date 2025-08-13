// src/shared/fetchCards.ts
import axios from "axios";

export async function fetchPage(
  _opts: Record<string, unknown>,
  page: number,
  apiKey: string
): Promise<any> {
  const url = "https://api.pokemontcg.io/v2/cards";
  const max = 3;
  let delay = 500;

  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      console.log(`🌐 Requesting page ${page} (attempt ${attempt}): ${url}?page=${page}&pageSize=250`);
      const res = await axios.get(url, {
        headers: { "X-Api-Key": apiKey },
        params: { page, pageSize: 250 },
        timeout: 180_000,
      });
      return res.data;
    } catch (err: any) {
      if (attempt === max) throw err;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error("unreachable");
}
