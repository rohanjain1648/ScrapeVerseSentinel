import { describe, it, expect } from "vitest";
import { Semaphore } from "../src/semaphore";

describe("Semaphore", () => {
  it("allows up to the concurrency limit in parallel", async () => {
    const sem = new Semaphore(3);
    let concurrent = 0;
    let maxConcurrent = 0;
    const task = async () => {
      await sem.acquire();
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      sem.release();
    };
    await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxConcurrent).toBe(3);
  });
});
