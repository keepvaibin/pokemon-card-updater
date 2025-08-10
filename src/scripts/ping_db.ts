import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

async function pingDatabase(name: string, url: string) {
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$connect();
    await prisma.$executeRawUnsafe('SELECT 1;');
    console.log(`✅ ${name} connection successful.`);
  } catch (err: any) {
    console.error(`❌ ${name} connection failed:`, err.message);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  const timescaleUrl = process.env.TIMESCALE_URL;

  if (!dbUrl) {
    console.error('DATABASE_URL is not set in environment.');
  } else {
    await pingDatabase('DATABASE_URL', dbUrl);
  }

  if (!timescaleUrl) {
    console.error('TIMESCALE_URL is not set in environment.');
  } else {
    await pingDatabase('TIMESCALE_URL', timescaleUrl);
  }
}

main();
