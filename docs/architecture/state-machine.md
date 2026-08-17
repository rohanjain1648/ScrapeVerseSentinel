# State machine

The loop from design spec §4, annotated with the exact `packages/sentinel` function that drives each transition. All of it runs inside one function, `runSentinelCycle()` in `packages/sentinel/src/machine.ts`, invoked once per collector per sweep (`apps/web/app/api/sweep/route.ts`).

```
                    classifyRun() → violations.length === 0
        ┌──────────────────────────────────────────────────┐
        │                                                    │
        ▼                                                    │
    HEALTHY ──classifyRun() finds a Violation──► DEGRADED ────┘
                                                     │
                                        canAttemptHeal() gate
                                                     │
                     ┌───────────────────────────────┼───────────────────────────────┐
                     │ allowed: true                  │ rate-limited                  │ 3 consecutive REJECTEDs
                     ▼                                 (reason doesn't start           ▼
              composeHealPrompt()                       "escalated:")            ESCALATED
                     │                                  │
                     ▼                                  ▼
               DIAGNOSING                            DEGRADED
                     │                          (stays, retried on
              brightData.heal()                  the next sweep)
                     │
                     ▼
                 HEALING
                     │
           heal status !== "failed"
                     │
                     ▼
              VERIFYING ── verifyAgainstGoldens() ──┐
                     │                                │
              all goldens pass                  any golden fails
              + contracts re-validate                 │
                     │                                │
                     ▼                                ▼
                PROMOTED                          REJECTED
       brightData.approve({autoSave:true})   (no approve call —
       + contract re-inferred from            prior template stays
       the newly-healed run                   active; escalation
                                               tracked via
                                               countConsecutiveRejections)
```

## Transition by transition

**`HEALTHY → DEGRADED`** — driven by `classifyRun()` (`@scrapeverse/contracts`, `packages/contracts/src/classify.ts`), called from `runSentinelCycle()` against the freshly-fetched `currentRun` and the contract on file (`db.getLatestContract`). If `classifyRun` returns zero violations, the cycle returns `{ finalState: "HEALTHY", violations: [] }` immediately — no heal attempt, no persistence beyond the run itself. If it returns one or more `Violation`s, the cycle proceeds toward `DEGRADED`. Note: on a collector's very first run (no contract yet on file), `runSentinelCycle` skips detection entirely and calls `inferContract([currentRun])` to bootstrap a baseline — there is nothing to violate against yet, so this path always returns `HEALTHY`, never `DEGRADED`.

**`DEGRADED` gate — `canAttemptHeal()`** (`packages/sentinel/src/safetyRails.ts`). Before any heal is attempted, `runSentinelCycle` calls `canAttemptHeal(db, collectorId)`, which enforces the two hard-coded safety rails from the spec:
- **Rate limit**: `countRecentHealAttempts(collectorId, 4)` — at most one heal attempt per collector per 4-hour window. If a recent attempt exists, `allowed: false` with a `"rate-limited: ..."` reason, and the cycle returns `finalState: "DEGRADED"` (stays degraded, eligible for retry once the window clears).
- **Hard stop**: `countConsecutiveRejections(collectorId)` — at 3 or more consecutive `REJECTED` outcomes, `allowed: false` with a reason string prefixed `"escalated: ..."`. `runSentinelCycle` checks specifically for that prefix to distinguish a permanent halt from an ordinary rate-limit wait, and returns `finalState: "ESCALATED"` — no further auto-heal until a human manually resets the collector.

**`DEGRADED → DIAGNOSING` — `composeHealPrompt()`** (`packages/sentinel/src/promptSynth.ts`). Only reached once `canAttemptHeal` allows it. `runSentinelCycle` first gathers evidence: a best-effort single scrape of the target URL (`brightData.scrape(url)`) to describe current DOM structure (there is no stored last-known-good snapshot to diff against, so this is an honest "current state only" note, not a fabricated two-snapshot diff). `composeHealPrompt(violations, fieldDescriptions, domNote)` turns each `Violation` plus the field's original plain-language description into heal-prompt text, and for `DRIFT`-class violations specifically appends language warning the healer against re-extracting a decoy value (e.g. a struck-through MSRP) that merely matches the old selector.

**`DIAGNOSING → HEALING` — `brightData.heal()`** (`BrightDataClient.heal`, `packages/brightdata`). `runSentinelCycle` calls `brightData.heal(collectorId, prompt)` inside a `try/catch`; if it throws (e.g. a transport error mid-mutation), the cycle persists a synthetic `REJECTED` `HealAttemptRecord` immediately rather than crashing, so the rate-limit and consecutive-rejection counters still see this attempt on the next sweep. If `heal()` resolves with `status: "failed"`, the cycle short-circuits straight to `REJECTED` without spending a golden-record run on a heal already known to have failed.

**`HEALING → VERIFYING` — `verifyAgainstGoldens()`** (`packages/sentinel/src/verify.ts`). Reached only when the heal call did not throw and did not report `status: "failed"`. `verifyAgainstGoldens(client, collectorId, goldens, contracts)` is the project's core "never blind-approve" enforcement point:
- If `goldens.length === 0`, it returns `passed: false` unconditionally — an unconfigured collector can never be auto-promoted.
- For each golden record, it re-runs the (now healed) collector via `client.runCollector(collectorId, golden.url)`, compares every expected field for exact equality against the returned row, and separately re-runs `classifyRun` against the same contracts — a golden can match on the fields it checks and still fail if the run trips an unrelated contract violation.
- `passed` is `true` only if every golden reproduced exactly *and* no golden's run violates the contract.

**`VERIFYING → PROMOTED` — `brightData.approve()`**. Reached only when `verification.passed === true`. `runSentinelCycle` persists a `PROMOTED` `HealAttemptRecord` (prompt, violations, verification result) via `db.saveHealAttempt`, then calls `brightData.approve(collectorId, { autoSave: true })`, re-runs the collector once more, and re-infers the contract from the newly-healthy run (`inferContract([healedRun])`) via `db.saveContract` — a healed layout may legitimately shift field names or baselines, so the contract is rebuilt rather than reused.

**`VERIFYING → REJECTED`**. Reached whenever `verification.passed === false` (goldens mismatched, a golden's run still violates the contract, the heal job itself reported `"failed"`, or `heal()`/`verifyAgainstGoldens` threw). `runSentinelCycle` persists the `REJECTED` `HealAttemptRecord` and deliberately never calls `brightData.approve` on this path — the prior, still-working template is left active by omission, not by an explicit rollback call. `REJECTED` outcomes are what `countConsecutiveRejections` counts toward the `ESCALATED` hard stop on a future cycle.

## A note on the state names vs. what actually gets returned

`SentinelState` (`packages/sentinel/src/types.ts`) defines all eight names — `HEALTHY | DEGRADED | DIAGNOSING | HEALING | VERIFYING | PROMOTED | REJECTED | ESCALATED` — matching the spec's diagram. In the current implementation, `DIAGNOSING`, `HEALING`, and `VERIFYING` are conceptual waypoints inside one synchronous `runSentinelCycle()` call rather than states persisted and returned individually — `SentinelCycleResult.finalState` only ever comes back as `HEALTHY`, `DEGRADED`, `ESCALATED`, `PROMOTED`, or `REJECTED`. The intermediate three are real in the sense that the code executes their work in that order (compose prompt → call heal → verify), but there is no separate DB write recording "now entering VERIFYING" — only the final outcome and its `HealAttemptRecord` are persisted. Read the diagram above as the logical flow the code follows, not as five distinct rows you'll find in `heal_attempts` per cycle.