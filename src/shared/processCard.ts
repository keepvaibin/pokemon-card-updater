import { PrismaClient } from "@prisma/client";
import { Attack, Ability, Weakness, Resistance } from "./types";
import { InvocationContext } from "@azure/functions";
import * as dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

const prismaTimescale =
  process.env.TIMESCALE_URL
    ? new PrismaClient({ datasources: { db: { url: process.env.TIMESCALE_URL } } })
    : null;

async function recordPriceEvent(
  cardId: string,
  averageSellPrice: number | null | undefined,
  source = "unknown"
) {
  if (!prismaTimescale) return; // skip if not configured
  const now = new Date();

  return prismaTimescale.priceHistory.create({
    data: { cardId, time: now, averageSellPrice, source },
  });
}

const DEBUG = process.env.DEBUG === "true";

export async function processCard(card: any, context: InvocationContext) {
  try {
    const existingCard = await prisma.card.findUnique({
      where: { id: card.id },
    });

    // If you want to replace always, skip the timestamp check:
    // Remove the block that skips update if newer

    if (existingCard) {
      // Delete all related child records first
      await Promise.all([
        prisma.attack.deleteMany({ where: { cardId: card.id } }),
        prisma.ability.deleteMany({ where: { cardId: card.id } }),
        prisma.weakness.deleteMany({ where: { cardId: card.id } }),
        prisma.resistance.deleteMany({ where: { cardId: card.id } }),
        prisma.cardLegalities.deleteMany({ where: { cardId: card.id } }),
        prisma.cardImages.deleteMany({ where: { cardId: card.id } }),
        prisma.tcgPlayerPrices.deleteMany({
          where: { TcgPlayer: { cardId: card.id } },
        }),
        prisma.tcgPlayer.deleteMany({ where: { cardId: card.id } }),
        prisma.cardMarket.deleteMany({ where: { cardId: card.id } }),
      ]);
    }

    //context.log(`🔄 Processing ${card.name} (${card.id})`);

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
                updatedAt: card.set.updatedAt && !isNaN(Date.parse(card.set.updatedAt)) ? new Date(card.set.updatedAt) : new Date('1970-01-01'),
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
                  reverseHolofoilDirectLow: card.tcgplayer.prices?.revnerseHolofoil?.directLow,
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

    // Upsert: update if exists, else create
    await prisma.card.upsert({
      where: { id: card.id },
      update: data,
      create: data,
    });

    const cmAvg = card.cardmarket?.prices?.averageSellPrice;
    const tpMarket =
      card.tcgplayer?.prices?.normal?.market ??
      card.tcgplayer?.prices?.holofoil?.market ??
      card.tcgplayer?.prices?.reverseHolofoil?.market;

    const avgForHistory = cmAvg ?? tpMarket ?? null;
    const source =
      cmAvg != null ? "cardmarket" :
      tpMarket != null ? "tcgplayer" : "unknown";

    if (card.id) {
      await recordPriceEvent(card.id, avgForHistory, source);
    }
    
  } catch (err) {
    context.error(`❌ Failed to process ${card.name} (${card.id}):`, err);
  }
}
