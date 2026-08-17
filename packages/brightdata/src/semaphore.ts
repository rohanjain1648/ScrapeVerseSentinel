export class Semaphore {
  private available: number;
  private queue: (() => void)[] = [];

  constructor(private limit: number) {
    this.available = limit;
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.available = Math.min(this.limit, this.available + 1);
    }
  }
}
