import { describe, it, expect } from "vitest";
import { canAttemptHeal } from "../src/safetyRails";
import { FakeDb } from "../../db/test/fakeDb";

describe("canAttemptHeal", () => {
  it("allows a heal when no recent attempts and no consecutive rejections exist", async () => {
    const db = new FakeDb();
    const result = await canAttemptHeal(db, "c_1");
    expect(result.allowed).toBe(true);
  });

  it("blocks a heal within 4 hours of a prior attempt", async () => {
    const db = new FakeDb();
    await db.saveHealAttempt({ collectorId: "c_1", violations: [], prompt: "p", state: "PROMOTED", decidedAt: new Date().toISOString() });
    const result = await canAttemptHeal(db, "c_1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/4 hour/i);
  });

  it("escalates and blocks after 3 consecutive rejections", async () => {
    const db = new FakeDb();
    for (let i = 0; i < 3; i++) {
      await db.saveHealAttempt({ collectorId: "c_1", violations: [], prompt: "p", state: "REJECTED", decidedAt: new Date(Date.now() - (i + 1) * 5 * 3600_000).toISOString() });
    }
    const result = await canAttemptHeal(db, "c_1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/escalat/i);
  });
});
