// src/shared/queueRegistry.ts
import { WorkQueue } from "./pageQueue";

const queues = new Map<string, WorkQueue>();

export function getWorkerQueue(workerId: string): WorkQueue {
  if (!workerId) throw new Error("getWorkerQueue: workerId is required");
  let q = queues.get(workerId);
  if (!q) {
    const conc = Number(process.env.DB_MAX_CONCURRENCY ?? 1); // keep 1 for one txn at a time
    q = new WorkQueue(conc);
    queues.set(workerId, q);
    console.log(`🧵 Created queue for ${workerId} (concurrency=${conc})`);
  }
  return q;
}
