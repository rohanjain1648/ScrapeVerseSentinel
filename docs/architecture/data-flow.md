# Data flow

Diagram from the design spec §1, annotated with the package that owns each box. Source: [docs/superpowers/specs/2026-08-06-scrapeverse-sentinel-design.md](../superpowers/specs/2026-08-06-scrapeverse-sentinel-design.md).

```
Chaos Lab / real sites
        │
        ▼
packages/brightdata   (BrightDataClient, mode: live | record | replay)
        │  rows: Row[]  { [field: string]: string | number | null }
        ▼
packages/contracts    classifyRun() → Violation[] tagged STRUCTURAL | SEMANTIC | DRIFT
        │  violations
        ▼
packages/sentinel     runSentinelCycle() — state machine, persists every transition
        │
        ├─ HEALTHY (no violation) ──────────────► store rows, update baseline contract
        │
        └─ DEGRADED → DIAGNOSING → HEALING → VERIFYING
                                        ├─ goldens pass → PROMOTED (brightData.approve)
                                        └─ goldens fail → REJECTED (rollback, escalate)
        │
        ▼
packages/db + apps/web  persisted state, rendered in the Sentinel console
```

## Box by box

**Chaos Lab / real sites** — `apps/chaos-lab` is the purpose-built demo storefront: a layout-version switch (`v1`/`v2`/`v3`/`semantic`, held in `apps/chaos-lab/app/api/version/route.ts`) lets a demo operator engineer each of the three failure classes on demand. "Real sites" refers to the four India quick-commerce targets (BigBasket, Blinkit, Zepto, JioMart) that `packages/shelf-truth` is built against as the flagship tenant. Neither box is code inside this repo's control-plane packages — both are just URLs that `packages/brightdata` points a collector at.

**`packages/brightdata`** — the single seam to Bright Data. `BrightDataClient` (defined in `packages/brightdata/src/types.ts`) exposes `trigger`, `getDataset`, `runCollector`, `heal`, `approve`, and `scrape`. `createBrightDataClient()` (`packages/brightdata/src/createClient.ts`) selects one of three implementations by the `BRIGHTDATA_MODE` env var:
- `live` — `LiveBrightDataClient` (`src/liveClient.ts`) makes real HTTP calls to Bright Data's REST API.
- `record` — wraps the live client with `CassetteRecorder` (`src/cassette.ts`), writing every request/response pair to `cassettes/<key>.json`.
- `replay` (the default when `BRIGHTDATA_MODE` is unset) — serves cached responses via `CassetteReplayer`, no network calls, fully deterministic.

Every call returns rows shaped `{ [field: string]: string | number | null }` (the `Row` type, independently defined but structurally identical in both `@scrapeverse/brightdata` and `@scrapeverse/contracts`, since `contracts` is not permitted a cross-package import).

**`packages/contracts`** — pure, zero-I/O detection engine. `inferContract(healthyRuns: Row[][]): FieldContract[]` (`src/infer.ts`) builds a per-field contract (type, currency, pattern, null-rate baseline, numeric range) from historically healthy runs. `classifyRun(contracts, currentRun, baselineRuns, opts?): Violation[]` (`src/classify.ts`) fans out to three independent detectors and concatenates their results:
- `detectStructural` (`src/structural.ts`) — null-rate over `contract.nullRate.max`, or row-count collapse vs. the trailing median.
- `detectSemantic` (`src/semantic.ts`) — type/pattern/hard-numeric-range failures.
- `detectDrift` (`src/drift.ts`) — Population Stability Index over a trailing baseline window, catching well-typed, in-range values that are nonetheless the wrong field (the "looks fine but isn't" case).

**`packages/sentinel`** — orchestration only, no scraping logic of its own. `runSentinelCycle()` (`src/machine.ts`) is the single entry point: it calls `brightData.runCollector`, persists the run, calls `classifyRun`, and if there are violations, gates on `canAttemptHeal` (`src/safetyRails.ts`) before composing a heal prompt with `composeHealPrompt` (`src/promptSynth.ts`), calling `brightData.heal`, and verifying with `verifyAgainstGoldens` (`src/verify.ts`) — see [state-machine.md](state-machine.md) for the full transition diagram. Every attempt (prompt sent, verification result, and outcome) is persisted through the `SentinelDb` interface (`src/types.ts`).

**`packages/db`** — the Supabase/Postgres schema (`src/schema.sql`: `collectors`, `contracts`, `runs`, `violations`, `heal_attempts`, `goldens`, `price_observations`) plus a typed query layer. `apps/web/app/api/sweep/route.ts`'s `toSentinelDb()` adapts these real queries to the `SentinelDb` interface that `runSentinelCycle` depends on; `packages/db/test/fakeDb.ts` satisfies the same interface for tests, with no Supabase connection required.

**`apps/web`** — the Sentinel console (collector list, collector detail with contract/violations/heal-attempt audit trail, Chaos Lab control panel, Shelf-Truth dashboard) and the operational entry point that drives the loop in production: `app/api/sweep/route.ts` is invoked on a 15-minute cron (`vercel.json`) and calls `runSentinelCycle` once per collector, isolating one collector's failure from the rest via a per-collector `try/catch`.

## A permanent limitation of the cassette scheme

The recorder/replayer key each Bright Data call by an opaque string (`wrapWithRecording`/`wrapWithReplay` in `packages/brightdata/src/createClient.ts`), and `runCollector`'s key is `run:${collectorId}:${url}` — no call-ordinal or timestamp component. This means a collector's pre-heal verification run and its post-heal verification run against the *same* golden URL are physically forced to replay the identical cassette file in `replay` mode; there is no way to record two genuinely distinct fixtures for "how did this URL look before the heal" vs. "how does it look after." `packages/sentinel/test/chaosLab.e2e.test.ts` works around this by constructing its REJECTED-path fixture so the (identical) replayed response is a genuine golden mismatch either way, rather than pretending pre/post-heal behavior differs. This is a real, permanent limitation of the current cassette design, not a bug slated for a fix — a call-ordinal or content-hash suffix on the cache key would remove it, but was out of scope for the hackathon timeline (see `packages/brightdata/src/cassette.ts`'s `keyToPath`, which was patched to hash long sanitized keys over 150 characters with a stable `sha256` suffix of the *original* key — that patch fixes a filename-length problem, not this key-collision problem, and keeps keys at or under 150 characters byte-for-byte unchanged).
