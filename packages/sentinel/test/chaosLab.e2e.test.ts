import { describe, it, expect, beforeAll } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createBrightDataClient } from "@scrapeverse/brightdata";
import { runSentinelCycle } from "../src/machine";
import { FakeDb } from "../../db/test/fakeDb";

// Resolve the cassette directory relative to THIS FILE, not the process
// cwd. Vitest's cwd differs depending on how the suite is invoked — cwd is
// packages/sentinel under `pnpm --filter @scrapeverse/sentinel test`, but
// the repo root under a root-level `pnpm test` (vitest workspace mode) —
// so a bare relative string like "cassettes/chaos-lab-full-cycle" resolves
// to two different, both-plausible-looking directories depending on how
// the test is run, and only one of them (packages/sentinel/cassettes/...)
// actually holds the fixtures below. An absolute, file-anchored path makes
// this test invocation-order-independent.
const CASSETTE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "cassettes", "chaos-lab-full-cycle");

//
// Two real, filesystem-level facts shaped which fixtures exist here:
//
// 1. `run:${collectorId}:${url}` is the cassette key for every
//    `runCollector` call regardless of *when* in the cycle it happens, so
//    the initial detection call and the later golden-verification call
//    inside verifyAgainstGoldens are physically forced to replay the same
//    file. There is exactly one `run_...json` fixture (null rows) for both.
//
// 2. `heal:${id}:${prompt}` embeds composeHealPrompt's full output text as
//    the cache key, and that text sanitizes to a filename of 450+ characters
//    even with a 1-character field description — verified empirically. That
//    exceeds NTFS's (and ext4's) ~255-character per-path-component limit, so
//    a matching file could not be created on any of this repo's target
//    filesystems under the original key-as-filename scheme. This was a real,
//    load-bearing defect in `packages/brightdata/src/cassette.ts` (Task 5) —
//    it would also break a genuine live `record`-mode run for any collector
//    with a heal path, not just this test — so `keyToPath` was patched to
//    hash keys over 150 sanitized characters (truncated prefix + a stable
//    sha256 suffix of the original key), leaving short/existing keys
//    byte-for-byte unaffected. The `heal_...json` fixture below uses the
//    resulting hashed filename, obtained by running this test once and
//    reading the exact name out of the "no cassette recorded for key" error.
//
// With both fixtures present, `client.heal(...)` now succeeds during replay
// and the cycle proceeds into `verifyAgainstGoldens` for real: the post-heal
// `run:` call still replays the same null-rows fixture (per point 1 above),
// so the golden comparison genuinely fails (`price` stays `null` vs. the
// golden's `"₹620"`), landing on REJECTED via the golden-mismatch path
// rather than via a heal-call exception.
describe("Chaos Lab full cycle (replay mode, no network)", () => {
  beforeAll(() => {
    process.env.BRIGHTDATA_MODE = "replay";
  });

  it("detects the v1->v2 structural break, heals, verifies against goldens, and rejects (golden mismatch)", async () => {
    const client = createBrightDataClient(CASSETTE_DIR);
    const db = new FakeDb();
    const collectorId = "c_chaoslab";
    const url = "https://chaos-lab.example.com";

    await db.saveContract(collectorId, [
      {
        name: "price",
        description: "current selling price including the ₹ symbol",
        type: "currency",
        currency: "INR",
        nullRate: { p50: 0.02, max: 0.1 },
        numericRange: { min: 100, max: 1000 },
      },
    ]);
    db.setGoldens(collectorId, [{ url, expected: { price: "₹620" } }]);

    const result = await runSentinelCycle(
      collectorId,
      url,
      { price: "current selling price including the ₹ symbol" },
      { brightData: client, db }
    );

    // Loose assertion (documents the same lenience the brief intended).
    expect(["PROMOTED", "REJECTED", "DEGRADED"]).toContain(result.finalState);

    // Precise assertion: given the hand-written fixture (null rows on both the
    // initial detection call AND the post-heal verification call — they share
    // the same `run:${collectorId}:${url}` cassette key, see the caveat at the
    // top of the recording script), the outcome is deterministic.
    expect(result.finalState).toBe("REJECTED");

    // The hard invariant regardless of which branch the recorded cassette
    // exercises: Sentinel must never have called approve without a passing
    // golden verification. There is no approve_*.json cassette fixture at
    // all — if a future regression in machine.ts ever called approve() on
    // this fixture, CassetteReplayer.replay would throw "no cassette
    // recorded for key" and this test would fail loudly.
    const healAttempts = db.getHealAttempts(collectorId);
    expect(healAttempts).toHaveLength(1);
    expect(healAttempts[0].state).toBe("REJECTED");
    expect(healAttempts[0].verificationResult?.goldensPassed).toBe(false);
  });
});
