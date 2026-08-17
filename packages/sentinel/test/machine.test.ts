import { describe, it, expect, vi } from "vitest";
import { runSentinelCycle } from "../src/machine";
import { FakeDb } from "../../db/test/fakeDb";
import { BrightDataClient } from "@scrapeverse/brightdata";

function fakeClient(overrides: Partial<BrightDataClient> = {}): BrightDataClient {
  return {
    trigger: async () => ({ snapshotId: "s" }),
    getDataset: async () => ({ status: "ready", rows: [] }),
    runCollector: async () => [{ price: "₹500" }],
    heal: vi.fn(async () => ({ jobId: "j", status: "completed" as const })),
    approve: vi.fn(async () => ({ approved: true })),
    scrape: async () => `<div class="price">₹500</div>`,
    ...overrides,
  };
}

const fieldDescriptions = { price: "current selling price including the ₹ symbol" };

const contract = { name: "price", description: "current selling price including the ₹ symbol", type: "currency" as const, currency: "INR", nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 100, max: 1000 } };

describe("runSentinelCycle", () => {
  it("stays HEALTHY and never calls heal/approve when the run matches its contract", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [contract]);
    const client = fakeClient({ runCollector: async () => [{ price: "₹520" }] });

    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });

    expect(result.finalState).toBe("HEALTHY");
    // Negative assertions on the mocks themselves — not just the final state string —
    // are the whole point of this test: a HEALTHY run must never touch heal or approve.
    expect(client.heal).not.toHaveBeenCalled();
    expect(client.approve).not.toHaveBeenCalled();
  });

  it("bootstraps a new contract and stays HEALTHY when no contract exists yet for the collector", async () => {
    const db = new FakeDb();
    const client = fakeClient({ runCollector: async () => [{ price: "₹500" }] });

    expect(await db.getLatestContract("c_1")).toBeNull();

    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });

    expect(result.finalState).toBe("HEALTHY");
    expect(client.heal).not.toHaveBeenCalled();
    expect(client.approve).not.toHaveBeenCalled();

    const savedContract = await db.getLatestContract("c_1");
    expect(savedContract).not.toBeNull();
    expect(savedContract?.some((f) => f.name === "price")).toBe(true);
  });

  it("PROMOTES a heal only when every golden reproduces and no contract violation remains", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [contract]);
    db.setGoldens("c_1", [{ url: "https://example.com/p1", expected: { price: "₹500" } }]);

    // Broken run triggers heal; after "healing", runCollector returns the golden's expected value.
    const client = fakeClient();
    // First call (the triggering run itself) is broken; every call after "heals" it.
    let callCount = 0;
    const runCollectorSpy = vi.fn(async (_id: string, _url: string) => {
      callCount++;
      if (callCount === 1) return [{ price: null }, { price: null }]; // the run that trips DEGRADED
      return [{ price: "₹500" }]; // verification calls after healing
    });
    const wrapped: BrightDataClient = { ...client, runCollector: runCollectorSpy };

    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: wrapped, db });

    expect(wrapped.heal).toHaveBeenCalled();
    expect(wrapped.approve).toHaveBeenCalledWith("c_1", { autoSave: true });
    expect(result.finalState).toBe("PROMOTED");

    // Strengthened ordering assertions: approve must fire strictly AFTER
    // verifyAgainstGoldens' runCollector call resolves with the reproduced golden,
    // and strictly BEFORE the post-heal contract-re-inference run. This proves
    // approve is not called unconditionally or before verification settles.
    const approveOrder = (wrapped.approve as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const healOrder = (wrapped.heal as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const goldenVerifyRunOrder = runCollectorSpy.mock.invocationCallOrder[1]; // 2nd call = golden verification
    const postApproveRunOrder = runCollectorSpy.mock.invocationCallOrder[2]; // 3rd call = post-heal re-run

    expect(healOrder).toBeLessThan(approveOrder);
    expect(goldenVerifyRunOrder).toBeLessThan(approveOrder);
    expect(approveOrder).toBeLessThan(postApproveRunOrder);

    // Assert on the PERSISTED audit record itself, not just the returned state —
    // this is what closes the regression gap on the {passed} -> {goldensPassed} mapping.
    const attempts = db.getHealAttempts("c_1");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].state).toBe("PROMOTED");
    expect(attempts[0].verificationResult?.goldensPassed).toBe(true);

    // I3 regression: post-promote contract re-inference must not clobber the
    // human-authored description with the bare field name.
    const savedContract = await db.getLatestContract("c_1");
    const priceField = savedContract?.find((f) => f.name === "price");
    expect(priceField?.description).toBe(contract.description);
    expect(priceField?.description).not.toBe("price"); // bare field name would mean the description got clobbered
  });

  it("REJECTS and never calls approve when goldens do not reproduce after healing", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [contract]);
    db.setGoldens("c_1", [{ url: "https://example.com/p1", expected: { price: "₹500" } }]);

    let callCount = 0;
    const client = fakeClient({
      runCollector: async () => {
        callCount++;
        if (callCount === 1) return [{ price: null }, { price: null }];
        return [{ price: "₹999" }]; // still wrong after "healing"
      },
    });

    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });

    expect(client.heal).toHaveBeenCalled();
    // The never-blind-approve invariant: verification failed, so approve must
    // NEVER be called — the old (still-working) template implicitly stays active
    // because nothing in the REJECTED branch touches approve or replaces the contract.
    expect(client.approve).not.toHaveBeenCalled();
    expect(result.finalState).toBe("REJECTED");

    // Assert on the persisted record too: goldensPassed must be false, not just
    // omitted or truthy-by-accident.
    const attempts = db.getHealAttempts("c_1");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].state).toBe("REJECTED");
    expect(attempts[0].verificationResult?.goldensPassed).toBe(false);

    // C2 regression: violations must be persisted (FK'd to the triggering run)
    // as soon as they're classified, independent of the eventual heal outcome.
    const savedViolations = db.getSavedViolations();
    expect(savedViolations).toHaveLength(1);
    expect(savedViolations[0].runId).toBeTruthy();
    expect(savedViolations[0].violations).toEqual(result.violations);
    expect(savedViolations[0].violations.length).toBeGreaterThan(0);
  });

  it("does not attempt a heal at all when safety rails block it (rate limit) — resolves DEGRADED", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [contract]);
    await db.saveHealAttempt({ collectorId: "c_1", violations: [], prompt: "p", state: "PROMOTED", decidedAt: new Date().toISOString() });

    const client = fakeClient({ runCollector: async () => [{ price: null }, { price: null }] });
    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });

    expect(client.heal).not.toHaveBeenCalled();
    // Also confirm the rate-limit gate doesn't quietly let approve slip through either.
    expect(client.approve).not.toHaveBeenCalled();
    expect(result.finalState).toBe("DEGRADED");
  });

  it("ESCALATES (not DEGRADED) and still never heals when safety rails hard-stop after 3 consecutive rejections", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [contract]);
    for (let i = 0; i < 3; i++) {
      await db.saveHealAttempt({ collectorId: "c_1", violations: [], prompt: "p", state: "REJECTED", decidedAt: new Date(Date.now() - (i + 1) * 5 * 3600_000).toISOString() });
    }

    const client = fakeClient({ runCollector: async () => [{ price: null }, { price: null }] });
    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });

    expect(client.heal).not.toHaveBeenCalled();
    expect(client.approve).not.toHaveBeenCalled();
    expect(result.finalState).toBe("ESCALATED");
    expect(result.reason).toMatch(/escalat/i);
  });

  it("REJECTS without ever verifying goldens when heal() itself reports status: \"failed\"", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [contract]);
    db.setGoldens("c_1", [{ url: "https://example.com/p1", expected: { price: "₹500" } }]);

    const verificationRunCollector = vi.fn(async (_id: string, _url: string) => [{ price: "₹500" }]); // would pass verification if it were ever called
    let callCount = 0;
    const client = fakeClient({
      runCollector: async (id: string, u: string) => {
        callCount++;
        if (callCount === 1) return [{ price: null }, { price: null }];
        return verificationRunCollector(id, u);
      },
      heal: vi.fn(async () => ({ jobId: "j", status: "failed" as const })),
    });

    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });

    expect(client.heal).toHaveBeenCalled();
    expect(verificationRunCollector).not.toHaveBeenCalled(); // verification skipped entirely, not run and ignored
    expect(client.approve).not.toHaveBeenCalled();
    expect(result.finalState).toBe("REJECTED");

    const attempts = db.getHealAttempts("c_1");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].verificationResult?.goldensPassed).toBe(false);
    expect(attempts[0].verificationResult?.details).toMatch(/heal job failed/i);
  });

  it("persists a REJECTED heal attempt and resolves (does not throw) when heal() itself throws, so the rate limit still sees it", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [contract]);

    const client = fakeClient({
      runCollector: async () => [{ price: null }, { price: null }],
      heal: vi.fn(async () => {
        throw new Error("network timeout");
      }),
    });

    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });

    expect(result.finalState).toBe("REJECTED");
    expect(client.approve).not.toHaveBeenCalled();

    const attempts = db.getHealAttempts("c_1");
    expect(attempts).toHaveLength(1);
    expect(attempts[0].state).toBe("REJECTED");
    expect(attempts[0].verificationResult?.goldensPassed).toBe(false);
    expect(attempts[0].verificationResult?.details).toMatch(/threw/i);

    // The audit trail must actually count toward the rate limit: an immediate
    // second cycle must be blocked, not fire another heal at a collector that
    // may still be mid-mutation from the failed attempt.
    const secondResult = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });
    expect(secondResult.finalState).toBe("DEGRADED");
    expect(client.heal).toHaveBeenCalledTimes(1);
  });
});
