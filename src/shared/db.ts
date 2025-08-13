// src/shared/db.ts
import * as dotenv from "dotenv";
dotenv.config();

import { PrismaClient as AppClient } from "@prisma/app-client";
import { PrismaClient as TsClient } from "@prisma/ts-client";

/**
 * One Prisma client PER WORKER (workerId).
 * In local Azure Functions, all HTTP functions share one Node process,
 * so module singletons cause contention. This registry fixes that:
 * - each worker gets its own app client (→ its own pool/connection_limit=1)
 * - each worker gets its own ts client (optional)
 */
const appClients = new Map<string, AppClient>();
const tsClients  = new Map<string, TsClient>();

export function getAppDb(workerId: string): AppClient {
  if (!workerId) throw new Error("getAppDb: workerId is required");
  let cli = appClients.get(workerId);
  if (!cli) {
    cli = new AppClient(); // uses DATABASE_URL
    appClients.set(workerId, cli);
    console.log(`🔌 Created App PrismaClient for ${workerId}`);
  }
  return cli;
}

export function getTsDb(workerId: string): TsClient | null {
  if (!workerId) throw new Error("getTsDb: workerId is required");
  if (!process.env.TIMESCALE_URL) return null;
  let cli = tsClients.get(workerId);
  if (!cli) {
    cli = new TsClient(); // uses TIMESCALE_URL
    tsClients.set(workerId, cli);
    console.log(`📈 Created TS PrismaClient for ${workerId}`);
  }
  return cli;
}
