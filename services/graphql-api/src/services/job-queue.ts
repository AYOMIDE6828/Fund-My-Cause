/**
 * In-memory FIFO queue that runs jobs away from the request path (#1699).
 * Producers call enqueue; a worker calls drain. A job that throws is reported
 * through onError and does not stop the jobs queued after it.
 */
export class JobQueue<T> {
  private readonly jobs: T[] = [];

  constructor(private readonly handler: (job: T) => Promise<void>) {}

  enqueue(job: T): void {
    this.jobs.push(job);
  }

  get size(): number {
    return this.jobs.length;
  }

  /** Runs queued jobs in order until the queue is empty. Returns how many ran. */
  async drain(onError: (err: unknown, job: T) => void = () => {}): Promise<number> {
    let processed = 0;
    while (this.jobs.length > 0) {
      const job = this.jobs.shift() as T;
      try {
        await this.handler(job);
      } catch (err) {
        onError(err, job);
      }
      processed++;
    }
    return processed;
  }
}
