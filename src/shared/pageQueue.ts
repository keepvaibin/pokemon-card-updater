// src/shared/pageQueue.ts
type Task = () => Promise<void>;

export class WorkQueue {
  private readonly concurrency: number;
  private running = 0;
  private queue: Task[] = [];

  constructor(concurrency: number) {
    if (concurrency < 1) throw new Error("concurrency must be >= 1");
    this.concurrency = concurrency;
  }

  push<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const wrapped: Task = async () => {
        this.running++;
        try {
          const val = await fn();
          resolve(val);
        } catch (e) {
          reject(e);
        } finally {
          this.running--;
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
      void next(); // start a task
    }
  }
}

// Singleton: up to 25 pages processing at once
export const pageProcessingQueue = new WorkQueue(25);
