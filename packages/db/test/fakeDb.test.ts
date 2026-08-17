import { describe, it, expect } from "vitest";
import { FakeDb } from "./fakeDb";

describe("FakeDb", () => {
  it("round-trips a run and its trailing history", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: 100 }], "OK");
    const runs = await db.getTrailingRuns("c_1", 5);
    expect(runs).toHaveLength(1);
    expect(runs[0].rows).toEqual([{ price: 100 }]);
  });

  it("counts recent heal attempts within the window", async () => {
    const db = new FakeDb();
    await db.saveHealAttempt({ collectorId: "c_1", violations: [], prompt: "p", state: "PROMOTED", decidedAt: new Date().toISOString() });
    expect(await db.countRecentHealAttempts("c_1", 4)).toBe(1);
  });

  it("counts consecutive rejections and resets on a promotion", async () => {
    const db = new FakeDb();
    for (let i = 0; i < 2; i++) {
      await db.saveHealAttempt({ collectorId: "c_1", violations: [], prompt: "p", state: "REJECTED", decidedAt: new Date().toISOString() });
    }
    expect(await db.countConsecutiveRejections("c_1")).toBe(2);
    await db.saveHealAttempt({ collectorId: "c_1", violations: [], prompt: "p", state: "PROMOTED", decidedAt: new Date().toISOString() });
    expect(await db.countConsecutiveRejections("c_1")).toBe(0);
  });
});
