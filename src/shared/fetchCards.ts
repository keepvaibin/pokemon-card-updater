import axios from "axios";
import * as dotenv from "dotenv";
import { writeFileSync } from "fs";
import path from "path";

dotenv.config();

const baseUrl = "https://api.pokemontcg.io/v2/cards";
const pageSize = 250;
const maxRetries = 30;
const timeout = 200000;

// 🔹 Utility to convert params to query string for logging
function toQueryString(params: Record<string, any>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
}

// 🔹 Fetch a single page with retries and logging
async function fetchPage(params: any, page: number, apikey: string): Promise<any> {
  const headers = { "X-API-KEY": apikey };
  const fullParams = { ...params, page, pageSize };
  const queryString = toQueryString(fullParams);
  const url = `${baseUrl}?${queryString}`;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🌐 Requesting page ${page} (attempt ${attempt}): ${url}`);
      const res = await axios.get(baseUrl, {
        headers,
        timeout,
        params: fullParams,
      });
      return res.data;
    } catch (err: any) {
      console.warn(`⚠️ Retry ${attempt}/${maxRetries} failed for page ${page}:`, err.message);
      if (attempt === maxRetries) throw err;
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }
}

// 🔹 Fetch cards from a range of pages (startPage to endPage)
export async function fetchCardRange(
  startPage: number,
  endPage: number,
  apikey: string,
  saveToFile: boolean = false
): Promise<{ cards: any[] }> {
  if (startPage < 1 || endPage < startPage) {
    throw new Error("Invalid page range");
  }

  let allCards: any[] = [];

  for (let page = startPage; page <= endPage; page++) {
    const data = await fetchPage({}, page, apikey);
    const { data: cards } = data;

    console.log(`📦 Fetched page ${page} with ${cards.length} cards`);
    allCards.push(...cards);
  }

  if (saveToFile) {
    const outputPath = path.resolve(`./cards-page-${startPage}-to-${endPage}.json`);
    writeFileSync(outputPath, JSON.stringify(allCards, null, 2));
    console.log(`💾 Saved cards to ${outputPath}`);
  }

  return { cards: allCards };
}
