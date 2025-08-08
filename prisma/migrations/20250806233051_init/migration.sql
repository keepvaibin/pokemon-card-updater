-- CreateTable
CREATE TABLE "public"."Card" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supertype" TEXT,
    "subtypes" TEXT[],
    "level" TEXT,
    "hp" TEXT,
    "types" TEXT[],
    "evolvesFrom" TEXT,
    "evolvesTo" TEXT[],
    "rules" TEXT[],
    "flavorText" TEXT,
    "artist" TEXT,
    "rarity" TEXT,
    "number" TEXT NOT NULL,
    "nationalPokedexNumbers" INTEGER[],
    "setId" TEXT,
    "retreatCost" TEXT[],
    "convertedRetreatCost" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Attack" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cost" TEXT[],
    "convertedEnergyCost" INTEGER NOT NULL,
    "damage" TEXT,
    "text" TEXT,

    CONSTRAINT "Attack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Ability" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Ability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Weakness" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Weakness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Resistance" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Resistance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CardLegalities" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "unlimited" TEXT,
    "standard" TEXT,
    "expanded" TEXT,

    CONSTRAINT "CardLegalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CardImages" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "small" TEXT,
    "large" TEXT,

    CONSTRAINT "CardImages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CardSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "series" TEXT NOT NULL,
    "printedTotal" INTEGER,
    "total" INTEGER,
    "ptcgoCode" TEXT,
    "releaseDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "symbol" TEXT,
    "logo" TEXT,

    CONSTRAINT "CardSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SetLegalities" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "unlimited" TEXT,
    "standard" TEXT,
    "expanded" TEXT,

    CONSTRAINT "SetLegalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TcgPlayer" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "url" TEXT,
    "updatedAt" TIMESTAMP(3),
    "pricesId" TEXT,

    CONSTRAINT "TcgPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TcgPlayerPrices" (
    "id" TEXT NOT NULL,
    "normalLow" DOUBLE PRECISION,
    "normalMid" DOUBLE PRECISION,
    "normalHigh" DOUBLE PRECISION,
    "normalMarket" DOUBLE PRECISION,
    "normalDirectLow" DOUBLE PRECISION,
    "holofoilLow" DOUBLE PRECISION,
    "holofoilMid" DOUBLE PRECISION,
    "holofoilHigh" DOUBLE PRECISION,
    "holofoilMarket" DOUBLE PRECISION,
    "holofoilDirectLow" DOUBLE PRECISION,
    "reverseHolofoilLow" DOUBLE PRECISION,
    "reverseHolofoilMid" DOUBLE PRECISION,
    "reverseHolofoilHigh" DOUBLE PRECISION,
    "reverseHolofoilMarket" DOUBLE PRECISION,
    "reverseHolofoilDirectLow" DOUBLE PRECISION,

    CONSTRAINT "TcgPlayerPrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CardMarket" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "url" TEXT,
    "updatedAt" TIMESTAMP(3),
    "averageSellPrice" DOUBLE PRECISION,
    "lowPrice" DOUBLE PRECISION,
    "trendPrice" DOUBLE PRECISION,
    "germanProLow" DOUBLE PRECISION,
    "suggestedPrice" DOUBLE PRECISION,
    "reverseHoloSell" DOUBLE PRECISION,
    "reverseHoloLow" DOUBLE PRECISION,
    "reverseHoloTrend" DOUBLE PRECISION,
    "lowPriceExPlus" DOUBLE PRECISION,
    "avg1" DOUBLE PRECISION,
    "avg7" DOUBLE PRECISION,
    "avg30" DOUBLE PRECISION,
    "reverseHoloAvg1" DOUBLE PRECISION,
    "reverseHoloAvg7" DOUBLE PRECISION,
    "reverseHoloAvg30" DOUBLE PRECISION,

    CONSTRAINT "CardMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ImportMetadata" (
    "id" TEXT NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CardLegalities_cardId_key" ON "public"."CardLegalities"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "CardImages_cardId_key" ON "public"."CardImages"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "SetLegalities_setId_key" ON "public"."SetLegalities"("setId");

-- CreateIndex
CREATE UNIQUE INDEX "TcgPlayer_cardId_key" ON "public"."TcgPlayer"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "TcgPlayer_pricesId_key" ON "public"."TcgPlayer"("pricesId");

-- CreateIndex
CREATE UNIQUE INDEX "CardMarket_cardId_key" ON "public"."CardMarket"("cardId");

-- AddForeignKey
ALTER TABLE "public"."Card" ADD CONSTRAINT "Card_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."CardSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attack" ADD CONSTRAINT "Attack_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Ability" ADD CONSTRAINT "Ability_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Weakness" ADD CONSTRAINT "Weakness_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Resistance" ADD CONSTRAINT "Resistance_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardLegalities" ADD CONSTRAINT "CardLegalities_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardImages" ADD CONSTRAINT "CardImages_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SetLegalities" ADD CONSTRAINT "SetLegalities_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."CardSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TcgPlayer" ADD CONSTRAINT "TcgPlayer_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TcgPlayer" ADD CONSTRAINT "TcgPlayer_pricesId_fkey" FOREIGN KEY ("pricesId") REFERENCES "public"."TcgPlayerPrices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardMarket" ADD CONSTRAINT "CardMarket_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
