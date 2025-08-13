// src/shared/pageQueue.ts
type Task<T = unknown> = () => Promise<T>;

export class WorkQueue {
  private readonly concurrency: number;
  private running = 0;
  private readonly queue: Task[] = [];

  constructor(concurrency: number) {
    if (!Number.isFinite(concurrency) || concurrency < 1) throw new Error("WorkQueue: concurrency must be >= 1");
    this.concurrency = Math.floor(concurrency);
  }

  push<T>(fn: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrapped: Task = async () => {
        this.running += 1;
        try {
          const res = await fn();
          resolve(res as any);
        } catch (err) {
          reject(err);
        } finally {
          this.running -= 1;
          this.dispatch();
        }
      };
      this.queue.push(wrapped);
      this.dispatch();
    });
  }

  private dispatch() {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      void next();
    }
  }
}
