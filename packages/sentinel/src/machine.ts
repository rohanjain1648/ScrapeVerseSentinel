import { classifyRun, inferContract } from "@scrapeverse/contracts";
import { composeHealPrompt } from "./promptSynth";
import { canAttemptHeal } from "./safetyRails";
import { verifyAgainstGoldens } from "./verify";
import { SentinelDeps, SentinelCycleResult, HealAttemptRecord } from "./types";

export async function runSentinelCycle(
  collectorId: string,
  url: string,
  fieldDescriptions: Record<string, string>,
  deps: SentinelDeps
): Promise<SentinelCycleResult> {
  const { brightData, db } = deps;

  const currentRun = await brightData.runCollector(collectorId, url);

  let contracts = await db.getLatestContract(collectorId);
  // Read the trailing-runs baseline BEFORE persisting currentRun below, so the
  // run currently being judged is never part of its own drift baseline (that
  // would systematically suppress the PSI score for the exact DRIFT class
  // this product exists to catch).
  const trailing = await db.getTrailingRuns(collectorId, 10);
  const baselineRuns = trailing.map((r) => r.rows) as any[];

  const runId = await db.saveRun(collectorId, currentRun, "OK");

  if (!contracts) {
    // No contract exists yet for this collector — this run becomes the baseline.
    // There is nothing to violate against, so we never heal or approve here.
    contracts = inferContract([currentRun]);
    await db.saveContract(collectorId, contracts);
    return { finalState: "HEALTHY", violations: [] };
  }

  const violations = classifyRun(contracts, currentRun, baselineRuns);
  if (violations.length === 0) {
    return { finalState: "HEALTHY", violations: [] };
  }

  // Persist the violations now, FK'd to the run that produced them, so the
  // audit trail (violation log) is populated even if a heal is rate-limited
  // or never attempted below.
  await db.saveViolations(runId, violations);

  // DEGRADED/ESCALATED — decide whether we're allowed to attempt a heal.
  const gate = await canAttemptHeal(db, collectorId);
  if (!gate.allowed) {
    // safetyRails signals a hard-stop (3 consecutive rejections) with a
    // reason string that starts with "escalated:" — surface that distinctly
    // from an ordinary rate-limit DEGRADED so an operator can tell "will
    // retry in 4 hours" apart from "permanently halted, needs a human."
    const finalState = gate.reason?.startsWith("escalated:") ? "ESCALATED" : "DEGRADED";
    return { finalState, violations, reason: gate.reason };
  }

  // DIAGNOSING — compose the heal prompt from evidence. We have no stored
  // "last known good" HTML snapshot to diff against, so we scrape the URL
  // ONCE and describe what we see rather than fabricating a two-snapshot
  // diff (a same-instant double-scrape would always show "no change" even
  // when a structural change IS the root cause — that would actively
  // mislead the heal prompt).
  let domNote = "no prior DOM snapshot available for comparison — evidence limited to current page structure";
  try {
    const html = await brightData.scrape(url);
    const classBearingElements = (html.match(/class="[^"]*"/g) ?? []).length;
    domNote = `current page structure captured at heal time (${classBearingElements} class-bearing element(s)) — no prior snapshot exists to diff against, so this describes current state only, not what changed`;
  } catch {
    // scrape is best-effort evidence; heal proceeds without it if unavailable.
  }
  const prompt = composeHealPrompt(violations, fieldDescriptions, domNote);

  // HEALING → VERIFYING. Wrapped in try/catch: if heal() or the verification
  // step throws (e.g. a network timeout after Bright Data already started
  // mutating the collector template), we must still record a heal attempt —
  // otherwise countRecentHealAttempts/countConsecutiveRejections see nothing,
  // and the very next sweep could fire another heal at a collector already
  // mid-mutation, defeating the rate limit. On catch we persist a synthetic
  // REJECTED attempt and resolve (not rethrow) so the cycle doesn't crash on
  // this kind of infra failure.
  let verification: { passed: boolean; details: string };
  try {
    const healResult = await brightData.heal(collectorId, prompt);

    if (healResult.status === "failed") {
      // No point re-running goldens against a heal we already know failed.
      verification = { passed: false, details: "heal job failed before verification" };
    } else {
      // TODO: heal() may return status: "pending"; this MVP doesn't poll for
      // completion before verifying, so a pending heal is verified
      // optimistically against whatever the collector currently returns.
      const goldens = await db.getGoldens(collectorId);
      verification = await verifyAgainstGoldens(brightData, collectorId, goldens, contracts);
    }
  } catch (err) {
    const attempt: HealAttemptRecord = {
      collectorId,
      violations,
      prompt,
      state: "REJECTED",
      verificationResult: { goldensPassed: false, details: "heal or verification threw: " + String(err) },
      decidedAt: new Date().toISOString(),
    };
    await db.saveHealAttempt(attempt);
    return { finalState: "REJECTED", violations };
  }

  const finalState = verification.passed ? "PROMOTED" : "REJECTED";
  const attempt: HealAttemptRecord = {
    collectorId,
    violations,
    prompt,
    state: finalState,
    verificationResult: { goldensPassed: verification.passed, details: verification.details },
    decidedAt: new Date().toISOString(),
  };
  await db.saveHealAttempt(attempt);

  if (finalState === "PROMOTED") {
    // Only reachable when verification.passed === true — see the ternary above.
    await brightData.approve(collectorId, { autoSave: true });
    const healedRun = await brightData.runCollector(collectorId, url);
    const reinferred = inferContract([healedRun]);
    // inferContract always sets description to the bare field name — it has
    // no way to know the human-authored meaning. `contracts` here is the
    // PRIOR contract (still in scope from before the heal), so carry its
    // per-field descriptions forward rather than letting a successful heal
    // silently erase them.
    const priorDescriptions = new Map(contracts.map((f) => [f.name, f.description]));
    const merged = reinferred.map((f) => ({
      ...f,
      description: priorDescriptions.get(f.name) ?? f.description,
    }));
    await db.saveContract(collectorId, merged);
  }
  // REJECTED: deliberately do not call approve — the prior (still-working)
  // template stays active because nothing here replaces it.

  return { finalState, violations };
}
