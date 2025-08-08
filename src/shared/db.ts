// src/db.ts
import { PrismaClient } from '@prisma/client';

export const dbPrimary = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL! } }, // your existing DB
});

export const dbTimescale = new PrismaClient({
  datasources: { db: { url: process.env.TIMESCALE_URL! } }, // your timescale-enabled DB
});
