// src/shared/processCard.ts
import * as dotenv from "dotenv";
dotenv.config();

// TWO generated clients (different outputs)
import { PrismaClient as AppClient } from "@prisma/app-client";
import { PrismaClient as TsClient } from "@prisma/ts-client";

import { Attack, Ability, Weakness, Resistance } from "./types";

// Instantiate once and reuse
const appDb = new AppClient(); // DATABASE_URL (add ?connection_limit=25&pool_timeout=5)
const tsDb  = process.env.TIMESCALE_URL ? new TsClient() : null; // TIMESCALE_URL

async function recordPriceEvent(
  cardId: string,
  averageSellPrice: number | null | undefined,
  source = "unknown"
) {
  if (!tsDb) return;
  const now = new Date();
  return tsDb.priceHistory.create({
    data: { cardId, time: now, averageSellPrice, source },
  });
}

export async function processCard(card: any): Promise<void> {
  try {
    // console.log(`🃏 Processing card: ${card?.name ?? "Unknown"} (ID: ${card?.id ?? "no-id"})`);
    const maxRetries = 3;
    const delayMs = 1000;

    let existingCard: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        existingCard = await appDb.card.findUnique({ where: { id: card.id } });
        break;
      } catch (err: any) {
        console.log(`⚠️ Retry ${attempt}/${maxRetries} findUnique ${card.id}: ${err.message}`);
        if (attempt === maxRetries) throw err;
        await new Promise(res => setTimeout(res, delayMs * attempt));
      }
    }

    // Build nested payload
    const data = {
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
        ? {
            create: {
              unlimited: card.legalities.unlimited,
              standard: card.legalities.standard,
              expanded: card.legalities.expanded,
            },
          }
        : undefined,
      images: card.images
        ? {
            create: {
              small: card.images.small,
              large: card.images.large,
            },
          }
        : undefined,
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
                releaseDate: new Date(card.set.releaseDate),
                updatedAt:
                  card.set.updatedAt && !isNaN(Date.parse(card.set.updatedAt))
                    ? new Date(card.set.updatedAt)
                    : new Date("1970-01-01"),
                symbol: card.set.images?.symbol,
                logo: card.set.images?.logo,
                legalities: card.set.legalities
                  ? {
                      create: {
                        unlimited: card.set.legalities.unlimited,
                        standard: card.set.legalities.standard,
                        expanded: card.set.legalities.expanded,
                      },
                    }
                  : undefined,
              },
            },
          }
        : undefined,
      tcgplayer: card.tcgplayer
        ? {
            create: {
              url: card.tcgplayer.url,
              updatedAt: new Date(card.tcgplayer.updatedAt),
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
              updatedAt: new Date(card.cardmarket.updatedAt),
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
        ? {
            create: card.attacks.map((attack: Attack) => ({
              name: attack.name,
              cost: attack.cost || [],
              convertedEnergyCost: attack.convertedEnergyCost,
              damage: attack.damage,
              text: attack.text,
            })),
          }
        : undefined,
      abilities: card.abilities?.length
        ? {
            create: card.abilities.map((ability: Ability) => ({
              name: ability.name,
              text: ability.text,
              type: ability.type,
            })),
          }
        : undefined,
      weaknesses: card.weaknesses?.length
        ? {
            create: card.weaknesses.map((weakness: Weakness) => ({
              type: weakness.type,
              value: weakness.value,
            })),
          }
        : undefined,
      resistances: card.resistances?.length
        ? {
            create: card.resistances.map((resistance: Resistance) => ({
              type: resistance.type,
              value: resistance.value,
            })),
          }
        : undefined,
    };

    // Optional optimization: use one transaction per card (uncomment if desired)
    // await appDb.$transaction(async (tx) => {
    //   if (existingCard) {
    //     await Promise.all([
    //       tx.attack.deleteMany({ where: { cardId: card.id } }),
    //       tx.ability.deleteMany({ where: { cardId: card.id } }),
    //       tx.weakness.deleteMany({ where: { cardId: card.id } }),
    //       tx.resistance.deleteMany({ where: { cardId: card.id } }),
    //       tx.cardLegalities.deleteMany({ where: { cardId: card.id } }),
    //       tx.cardImages.deleteMany({ where: { cardId: card.id } }),
    //       tx.tcgPlayerPrices.deleteMany({ where: { TcgPlayer: { cardId: card.id } } }),
    //       tx.tcgPlayer.deleteMany({ where: { cardId: card.id } }),
    //       tx.cardMarket.deleteMany({ where: { cardId: card.id } }),
    //     ]);
    //   }
    //   await tx.card.upsert({ where: { id: card.id }, update: data, create: data });
    // });

    // Current behavior: keep your two-phase approach with retries
    if (existingCard) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await Promise.all([
            appDb.attack.deleteMany({ where: { cardId: card.id } }),
            appDb.ability.deleteMany({ where: { cardId: card.id } }),
            appDb.weakness.deleteMany({ where: { cardId: card.id } }),
            appDb.resistance.deleteMany({ where: { cardId: card.id } }),
            appDb.cardLegalities.deleteMany({ where: { cardId: card.id } }),
            appDb.cardImages.deleteMany({ where: { cardId: card.id } }),
            appDb.tcgPlayerPrices.deleteMany({ where: { TcgPlayer: { cardId: card.id } } }),
            appDb.tcgPlayer.deleteMany({ where: { cardId: card.id } }),
            appDb.cardMarket.deleteMany({ where: { cardId: card.id } }),
          ]);
          break;
        } catch (err: any) {
          console.log(`⚠️ Retry ${attempt}/${maxRetries} delete related ${card.id}: ${err.message}`);
          if (attempt === maxRetries) throw err;
          await new Promise(res => setTimeout(res, delayMs * attempt));
        }
      }
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await appDb.card.upsert({
          where: { id: card.id },
          update: data,
          create: data,
        });
        break;
      } catch (err: any) {
        console.log(`⚠️ Retry ${attempt}/${maxRetries} upsert ${card.id}: ${err.message}`);
        if (attempt === maxRetries) throw err;
        await new Promise(res => setTimeout(res, delayMs * attempt));
      }
    }

    // Timescale history
    const cmAvg = card.cardmarket?.prices?.averageSellPrice;
    const tpMarket =
      card.tcgplayer?.prices?.normal?.market ??
      card.tcgplayer?.prices?.holofoil?.market ??
      card.tcgplayer?.prices?.reverseHolofoil?.market;

    const avgForHistory = cmAvg ?? tpMarket ?? null;
    const source =
      cmAvg != null ? "cardmarket" :
      tpMarket != null ? "tcgplayer" : "unknown";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (card.id) await recordPriceEvent(card.id, avgForHistory, source);
        break;
      } catch (err: any) {
        console.log(`⚠️ Retry ${attempt}/${maxRetries} PriceHistory ${card.id}: ${err.message}`);
        if (attempt === maxRetries) throw err;
        await new Promise(res => setTimeout(res, delayMs * attempt));
      }
    }
  } catch (err: any) {
    console.error(`❌ Failed to process ${card?.name} (${card?.id}): ${err.message ?? err}`);
  }
}
