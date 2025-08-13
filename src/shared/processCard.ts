// src/shared/processCard.ts
import * as dotenv from "dotenv";
dotenv.config();

import { Prisma as AppPrisma } from "@prisma/app-client";
import { getAppDb, getTsDb } from "./db";

function buildPriceRows(cards: any[]) {
  const rows: { cardId: string; time: Date; averageSellPrice: number | null; source: string | null }[] = [];
  const now = new Date();
  for (const card of cards) {
    if (!card?.id) continue;
    const avg =
      card.tcgplayer?.prices?.normal?.market ??
      card.tcgplayer?.prices?.holofoil?.market ??
      card.cardmarket?.prices?.trendPrice ??
      null;
    rows.push({
      cardId: card.id,
      time: now,
      averageSellPrice: avg != null ? Number(avg) : null,
      source: card.tcgplayer ? "tcgplayer" : card.cardmarket ? "cardmarket" : null,
    });
  }
  return rows;
}

/**
 * Process ~250 cards in ONE interactive transaction on card_db (single connection),
 * then write ONE batch to Timescale. NO raw SQL. Timeouts are set via Prisma API.
 *
 * workerId ensures we use the worker-specific Prisma clients (→ per-worker pool).
 */
export async function processPage(cards: any[], workerId: string): Promise<void> {
  if (!cards?.length) return;

  const appDb = getAppDb(workerId);
  const tsDb  = getTsDb(workerId);
  const priceRows = buildPriceRows(cards);

  const maxWait = Number(process.env.PRISMA_TX_MAX_WAIT_MS ?? 30_000);  // up to 30s waiting to start
  const timeout = Number(process.env.PRISMA_TX_TIMEOUT_MS  ?? 300_000); // up to 5m to run the page

  await appDb.$transaction(
    async (tx: AppPrisma.TransactionClient) => {
      for (const card of cards) {
        if (!card?.id) continue;

        const existing = await tx.card.findUnique({ where: { id: card.id } }).catch(() => null);

        if (existing) {
          await Promise.all([
            tx.attack.deleteMany({ where: { cardId: card.id } }),
            tx.ability.deleteMany({ where: { cardId: card.id } }),
            tx.weakness.deleteMany({ where: { cardId: card.id } }),
            tx.resistance.deleteMany({ where: { cardId: card.id } }),
            tx.cardLegalities.deleteMany({ where: { cardId: card.id } }),
            tx.cardImages.deleteMany({ where: { cardId: card.id } }),
            tx.tcgPlayerPrices.deleteMany({ where: { TcgPlayer: { cardId: card.id } } }),
            tx.tcgPlayer.deleteMany({ where: { cardId: card.id } }),
            tx.cardMarket.deleteMany({ where: { cardId: card.id } }),
          ]);
        }

        const data: any = {
          id: card.id,
          name: card.name,
          supertype: card.supertype,
          subtypes: card.subtypes || [],
          level: card.level,
          hp: card.hp,
          types: card.types || [],
          evolvesFrom: card.evolvesFrom,
          evolvesTo: card.evolvesTo || [],
          rules: card.rules || [],
          flavorText: card.flavorText,
          artist: card.artist,
          rarity: card.rarity,
          number: card.number,
          nationalPokedexNumbers: card.nationalPokedexNumbers || [],
          convertedRetreatCost: card.convertedRetreatCost,
          retreatCost: card.retreatCost || [],

          legalities: card.legalities
            ? { create: { unlimited: card.legalities.unlimited, standard: card.legalities.standard, expanded: card.legalities.expanded } }
            : undefined,

          images: card.images ? { create: { small: card.images.small, large: card.images.large } } : undefined,

          set: card.set
            ? {
                connectOrCreate: {
                  where: { id: card.set.id },
                  create: {
                    id: card.set.id,
                    name: card.set.name,
                    series: card.set.series,
                    printedTotal: card.set.printedTotal,
                    total: card.set.total,
                    ptcgoCode: card.set.ptcgoCode,
                    releaseDate: card.set.releaseDate ? new Date(card.set.releaseDate) : undefined,
                    updatedAt:
                      card.set.updatedAt && !isNaN(Date.parse(card.set.updatedAt))
                        ? new Date(card.set.updatedAt)
                        : undefined,
                    symbol: card.set.images?.symbol,
                    logo: card.set.images?.logo,
                    legalities: card.set.legalities
                      ? { create: { unlimited: card.set.legalities.unlimited, standard: card.set.legalities.standard, expanded: card.set.legalities.expanded } }
                      : undefined,
                  },
                },
              }
            : undefined,

          tcgplayer: card.tcgplayer
            ? {
                create: {
                  url: card.tcgplayer.url,
                  updatedAt: card.tcgplayer.updatedAt ? new Date(card.tcgplayer.updatedAt) : undefined,
                  prices: {
                    create: {
                      normalLow: card.tcgplayer.prices?.normal?.low,
                      normalMid: card.tcgplayer.prices?.normal?.mid,
                      normalHigh: card.tcgplayer.prices?.normal?.high,
                      normalMarket: card.tcgplayer.prices?.normal?.market,
                      normalDirectLow: card.tcgplayer.prices?.normal?.directLow,

                      holofoilLow: card.tcgplayer.prices?.holofoil?.low,
                      holofoilMid: card.tcgplayer.prices?.holofoil?.mid,
                      holofoilHigh: card.tcgplayer.prices?.holofoil?.high,
                      holofoilMarket: card.tcgplayer.prices?.holofoil?.market,
                      holofoilDirectLow: card.tcgplayer.prices?.holofoil?.directLow,

                      reverseHolofoilLow: card.tcgplayer.prices?.reverseHolofoil?.low,
                      reverseHolofoilMid: card.tcgplayer.prices?.reverseHolofoil?.mid,
                      reverseHolofoilHigh: card.tcgplayer.prices?.reverseHolofoil?.high,
                      reverseHolofoilMarket: card.tcgplayer.prices?.reverseHolofoil?.market,
                      reverseHolofoilDirectLow: card.tcgplayer.prices?.reverseHolofoil?.directLow,
                    },
                  },
                },
              }
            : undefined,

          cardmarket: card.cardmarket
            ? {
                create: {
                  url: card.cardmarket.url,
                  updatedAt: card.cardmarket.updatedAt ? new Date(card.cardmarket.updatedAt) : undefined,
                  averageSellPrice: card.cardmarket.prices?.averageSellPrice,
                  lowPrice: card.cardmarket.prices?.lowPrice,
                  trendPrice: card.cardmarket.prices?.trendPrice,
                  germanProLow: card.cardmarket.prices?.germanProLow,
                  suggestedPrice: card.cardmarket.prices?.suggestedPrice,
                  reverseHoloSell: card.cardmarket.prices?.reverseHoloSell,
                  reverseHoloLow: card.cardmarket.prices?.reverseHoloLow,
                  reverseHoloTrend: card.cardmarket.prices?.reverseHoloTrend,
                  lowPriceExPlus: card.cardmarket.prices?.lowPriceExPlus,
                  avg1: card.cardmarket.prices?.avg1,
                  avg7: card.cardmarket.prices?.avg7,
                  avg30: card.cardmarket.prices?.avg30,
                  reverseHoloAvg1: card.cardmarket.prices?.reverseHoloAvg1,
                  reverseHoloAvg7: card.cardmarket.prices?.reverseHoloAvg7,
                  reverseHoloAvg30: card.cardmarket.prices?.reverseHoloAvg30,
                },
              }
            : undefined,

          attacks: card.attacks?.length
            ? { create: (card.attacks as any[]).map((a) => ({ name: a.name, cost: a.cost || [], convertedEnergyCost: a.convertedEnergyCost, damage: a.damage, text: a.text })) }
            : undefined,

          abilities: card.abilities?.length
            ? { create: (card.abilities as any[]).map((ab) => ({ name: ab.name, text: ab.text, type: ab.type })) }
            : undefined,

          weaknesses: card.weaknesses?.length
            ? { create: (card.weaknesses as any[]).map((w) => ({ type: w.type, value: w.value })) }
            : undefined,

          resistances: card.resistances?.length
            ? { create: (card.resistances as any[]).map((r) => ({ type: r.type, value: r.value })) }
            : undefined,
        };

        await tx.card.upsert({ where: { id: card.id }, update: data, create: data });
      }
    },
    { maxWait, timeout }
  );

  if (tsDb && priceRows.length) {
    try {
      await tsDb.priceHistory.createMany({ data: priceRows, skipDuplicates: true });
    } catch {
      for (const r of priceRows) {
        try {
          await tsDb.priceHistory.upsert({
            where: { cardId_time: { cardId: r.cardId, time: r.time } as any },
            update: { averageSellPrice: r.averageSellPrice, source: r.source ?? undefined },
            create: { cardId: r.cardId, time: r.time, averageSellPrice: r.averageSellPrice, source: r.source ?? undefined },
          } as any);
        } catch {}
      }
    }
  }
}
