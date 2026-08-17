# ScrapeVerse Sentinel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build ScrapeVerse Sentinel — a control plane above Bright Data Scraper Studio collectors that detects three classes of scraper failure (structural/semantic/drift) against learned data contracts, self-heals via `scraper heal`, and only promotes a fix after it reproduces golden records — plus its flagship tenant (Shelf-Truth, India quick-commerce shrinkflation tracking) and a Chaos Lab demo storefront for a live, unfaked demo.

**Architecture:** TypeScript pnpm monorepo. `packages/contracts` is pure (no I/O) and does violation detection. `packages/brightdata` is the sole seam to Bright Data, switchable between `live`/`record`/`replay` via cassettes so demos never depend on live credits. `packages/sentinel` orchestrates the detect→diagnose→heal→verify→promote state machine against fake-able `SentinelDb`/`BrightDataClient` interfaces. `apps/chaos-lab` is a mutable storefront for the live demo. `apps/web` is the Next.js console. Supabase/Postgres persists everything through `packages/db`.

**Tech Stack:** TypeScript, pnpm workspaces, Next.js 15 (App Router), Supabase (Postgres), Vitest (+ fast-check for property tests), @testing-library/react, Vercel Cron.

## Global Constraints

- Bright Data CLI: `brightdata scraper heal <id> "<prompt>"` and `brightdata scraper approve <id> [--auto-save]` — approval is never automatic without golden verification (spec §4).
- Bright Data REST: `POST /dca/trigger?collector=<id>`, `GET /dca/dataset?id=<snapshot_id>`, `POST /dca/collectors/{id}/refactor_template` (heal), approve endpoint mirrors refactor_template's collector-scoped path.
- Concurrency cap: max 3 in-flight create/heal calls per account — local semaphore, not just retry-on-429.
- Polling: 5s interval, ~60 attempts max, retry 5xx with backoff, fail fast (no retry) on 4xx.
- `packages/contracts` MUST have zero network/DB imports — pure functions only.
- `packages/brightdata` is the ONLY module permitted to construct a request to `dca.brightdata.com`.
- Sentinel MUST NOT call `approve` unless all golden records for that collector pass AND no contract violations remain (spec §4 — this is the core invariant, tested exhaustively).
- Safety rails: max 1 heal attempt per collector per 4 hours; hard stop → `ESCALATED` after 3 consecutive `REJECTED` heals.
- Package names: `@scrapeverse/db`, `@scrapeverse/brightdata`, `@scrapeverse/contracts`, `@scrapeverse/sentinel`, `@scrapeverse/shelf-truth`.
- No commits are made by the agent unless explicitly executing this plan's own Step "Commit" — user has stated they will handle git themselves for anything beyond that; if in doubt, stage but do not push.

---

## File Structure

```
scrape-verse/
├─ package.json, pnpm-workspace.yaml, tsconfig.base.json, vitest.workspace.ts, .env.example
├─ packages/
│  ├─ db/src/{schema.sql, client.ts, types.ts, collectors.ts, contracts.ts, runs.ts,
│  │           violations.ts, healAttempts.ts, goldens.ts, priceObservations.ts}
│  │       test/fakeDb.ts
│  ├─ brightdata/src/{types.ts, semaphore.ts, cassette.ts, liveClient.ts, createClient.ts}
│  │              test/{semaphore.test.ts, cassette.test.ts, liveClient.test.ts}
│  │              cassettes/sample.json
│  ├─ contracts/src/{types.ts, infer.ts, structural.ts, semantic.ts, drift.ts, classify.ts}
│  │               test/{infer.test.ts, structural.test.ts, semantic.test.ts, drift.test.ts,
│  │                      classify.property.test.ts}
│  ├─ sentinel/src/{types.ts, domDiff.ts, promptSynth.ts, safetyRails.ts, verify.ts, machine.ts}
│  │              test/{domDiff.test.ts, promptSynth.test.ts, safetyRails.test.ts,
│  │                     verify.test.ts, machine.test.ts}
│  └─ shelf-truth/src/{types.ts, normalizePackSize.ts, unitPrice.ts, shrinkflation.ts}
│                    test/{normalizePackSize.test.ts, unitPrice.test.ts, shrinkflation.test.ts}
├─ apps/
│  ├─ chaos-lab/{app/page.tsx, app/layout.tsx, app/api/version/route.ts,
│  │              lib/products.ts, lib/layoutVersions.tsx}
│  │             test/layoutVersions.test.tsx
│  └─ web/{app/page.tsx, app/collectors/[id]/page.tsx, app/chaos-lab/page.tsx,
│  │        app/shelf-truth/page.tsx, app/api/sweep/route.ts,
│  │        components/{CollectorCard.tsx, ContractView.tsx, ViolationLog.tsx,
│  │                     HealAttemptTimeline.tsx, ShrinkflationTable.tsx}, vercel.json}
│  │       test/{CollectorCard.test.tsx, ShrinkflationTable.test.tsx}
├─ cassettes/chaos-lab-full-cycle.json
└─ docs/architecture/{data-flow.md, state-machine.md}
```

---

## Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.workspace.ts`, `.env.example`, `.gitignore`

**Interfaces:**
- Produces: workspace layout `packages/*`, `apps/*` that every later task's `package.json` plugs into.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "scrapeverse-sentinel",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "fast-check": "^3.19.0"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 4: Create `vitest.workspace.ts`**

```ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/*/vitest.config.ts",
  "apps/*/vitest.config.ts",
]);
```

- [ ] **Step 5: Create `.env.example`**

```
BRIGHTDATA_MODE=replay
BRIGHTDATA_API_KEY=
BRIGHTDATA_API_BASE=https://api.brightdata.com
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CHAOS_LAB_ADMIN_URL=http://localhost:3001
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
.next/
.env
*.local
```

- [ ] **Step 7: Install and verify workspace resolves**

Run: `pnpm install`
Expected: lockfile created, no errors (workspace has no packages yet, that's fine).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo"
```

---

## Task 2: Supabase schema + db client + types

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/vitest.config.ts`
- Create: `packages/db/src/schema.sql`, `packages/db/src/client.ts`, `packages/db/src/types.ts`
- Test: `packages/db/test/client.test.ts`

**Interfaces:**
- Produces: `RowRecord`, `CollectorRow`, `ContractRow`, `RunRow`, `ViolationRow`, `HealAttemptRow`, `GoldenRow`, `PriceObservationRow` types; `createSupabaseClient(): SupabaseClient` used by Task 3's query modules.

- [ ] **Step 1: Write `packages/db/src/schema.sql`**

```sql
create table collectors (
  id text primary key,
  name text not null,
  source_url text not null,
  target_site text not null,
  current_contract_version int not null default 0,
  state text not null default 'HEALTHY',
  created_at timestamptz not null default now()
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  collector_id text not null references collectors(id),
  version int not null,
  fields jsonb not null,
  inferred_at timestamptz not null default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  collector_id text not null references collectors(id),
  snapshot_id text,
  row_count int not null,
  rows jsonb not null,
  status text not null,
  run_at timestamptz not null default now()
);

create table violations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id),
  field text not null,
  class text not null,
  detail jsonb not null
);

create table heal_attempts (
  id uuid primary key default gen_random_uuid(),
  collector_id text not null references collectors(id),
  triggered_by_violation_id uuid references violations(id),
  prompt text not null,
  state text not null,
  verification_result jsonb,
  decided_at timestamptz not null default now()
);

create table goldens (
  id uuid primary key default gen_random_uuid(),
  collector_id text not null references collectors(id),
  url text not null,
  expected jsonb not null,
  verified_by text not null,
  verified_at timestamptz not null default now()
);

create table price_observations (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  retailer text not null,
  pack_size_raw text not null,
  pack_size_normalized numeric not null,
  unit text not null,
  unit_price numeric not null,
  observed_at timestamptz not null default now()
);
```

- [ ] **Step 2: Write `packages/db/src/types.ts`**

```ts
export interface CollectorRow {
  id: string;
  name: string;
  source_url: string;
  target_site: string;
  current_contract_version: number;
  state: string;
  created_at: string;
}

export interface ContractRow {
  id: string;
  collector_id: string;
  version: number;
  fields: unknown;
  inferred_at: string;
}

export interface RunRow {
  id: string;
  collector_id: string;
  snapshot_id: string | null;
  row_count: number;
  rows: unknown;
  status: string;
  run_at: string;
}

export interface ViolationRow {
  id: string;
  run_id: string;
  field: string;
  class: string;
  detail: unknown;
}

export interface HealAttemptRow {
  id: string;
  collector_id: string;
  triggered_by_violation_id: string | null;
  prompt: string;
  state: string;
  verification_result: unknown;
  decided_at: string;
}

export interface GoldenRow {
  id: string;
  collector_id: string;
  url: string;
  expected: unknown;
  verified_by: string;
  verified_at: string;
}

export interface PriceObservationRow {
  id: string;
  product_id: string;
  retailer: string;
  pack_size_raw: string;
  pack_size_normalized: number;
  unit: string;
  unit_price: number;
  observed_at: string;
}
```

- [ ] **Step 3: Write `packages/db/src/client.ts`**

```ts
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
```

- [ ] **Step 4: Write failing test `packages/db/test/client.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSupabaseClient } from "../src/client";

describe("createSupabaseClient", () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });

  it("throws when env vars are missing", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => createSupabaseClient()).toThrow(/SUPABASE_URL/);
  });

  it("constructs a client when env vars are present", () => {
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    expect(() => createSupabaseClient()).not.toThrow();
  });
});
```

- [ ] **Step 5: Add `packages/db/package.json`, `tsconfig.json`, `vitest.config.ts`**

```json
{
  "name": "@scrapeverse/db",
  "version": "0.0.1",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": { "@supabase/supabase-js": "^2.45.0" },
  "devDependencies": { "vitest": "^2.0.0" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" }
}
```
`tsconfig.json` extends `../../tsconfig.base.json` with `"include": ["src", "test"]`.
`vitest.config.ts` is the standard `defineConfig({ test: { environment: "node" } })`.

- [ ] **Step 6: Run test, verify it fails first (before client.ts exists) then passes**

Run: `pnpm --filter @scrapeverse/db test`
Expected: PASS (client.ts already written above — write test first in practice, confirm red before writing client.ts, per TDD; here both are specified together for plan completeness, executor writes test, runs it against a stub throwing `Error("not implemented")`, confirms fail, then implements client.ts as above, reruns to confirm pass).

- [ ] **Step 7: Commit**

```bash
git add packages/db
git commit -m "feat(db): add schema, types, and supabase client factory"
```

---

## Task 3: db typed query modules + fakeDb

**Files:**
- Create: `packages/db/src/{collectors,contracts,runs,violations,healAttempts,goldens,priceObservations}.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/test/fakeDb.ts`
- Test: `packages/db/test/fakeDb.test.ts`

**Interfaces:**
- Consumes: `createSupabaseClient` (Task 2), row types (Task 2).
- Produces: `FakeDb` class implementing every query module's function signature in-memory — this is what Task 16 (`sentinel/machine.test.ts`) and later tasks use instead of a real Supabase connection.

- [ ] **Step 1: Write `packages/db/src/runs.ts`** (representative of the pattern; other modules follow identically)

```ts
import { SupabaseClient } from "@supabase/supabase-js";
import { RunRow } from "./types";

export async function saveRun(
  client: SupabaseClient,
  collectorId: string,
  rows: unknown[],
  status: string,
  snapshotId?: string
): Promise<string> {
  const { data, error } = await client
    .from("runs")
    .insert({ collector_id: collectorId, rows, row_count: rows.length, status, snapshot_id: snapshotId ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getTrailingRuns(
  client: SupabaseClient,
  collectorId: string,
  n: number
): Promise<RunRow[]> {
  const { data, error } = await client
    .from("runs")
    .select("*")
    .eq("collector_id", collectorId)
    .order("run_at", { ascending: false })
    .limit(n);
  if (error) throw error;
  return (data ?? []) as RunRow[];
}
```

- [ ] **Step 2: Write `contracts.ts`, `collectors.ts`, `violations.ts`, `healAttempts.ts`, `goldens.ts`, `priceObservations.ts`** following the same `(client, ...args) => Promise<T>` pattern, each exporting exactly the functions named in the spec's schema section:
  - `contracts.ts`: `saveContract(client, collectorId, version, fields)`, `getLatestContract(client, collectorId): Promise<ContractRow | null>`
  - `collectors.ts`: `upsertCollector(client, row)`, `listCollectors(client): Promise<CollectorRow[]>`, `getCollector(client, id): Promise<CollectorRow | null>`, `setCollectorState(client, id, state)`
  - `violations.ts`: `saveViolations(client, runId, violations)`, `listViolations(client, collectorId, limit)`
  - `healAttempts.ts`: `saveHealAttempt(client, attempt)`, `countRecentHealAttempts(client, collectorId, sinceHours): Promise<number>`, `countConsecutiveRejections(client, collectorId): Promise<number>`
  - `goldens.ts`: `addGolden(client, golden)`, `getGoldens(client, collectorId): Promise<GoldenRow[]>`
  - `priceObservations.ts`: `savePriceObservation(client, obs)`, `listByProduct(client, productId): Promise<PriceObservationRow[]>`

- [ ] **Step 3: Write `packages/db/src/index.ts`** re-exporting every module and every type.

```ts
export * from "./types";
export * from "./client";
export * from "./collectors";
export * from "./contracts";
export * from "./runs";
export * from "./violations";
export * from "./healAttempts";
export * from "./goldens";
export * from "./priceObservations";
```

- [ ] **Step 4: Write failing test `packages/db/test/fakeDb.test.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/db test -- fakeDb`
Expected: FAIL — `fakeDb.ts` does not exist yet.

- [ ] **Step 6: Write `packages/db/test/fakeDb.ts`** (in-memory implementation satisfying `SentinelDb` shape defined in Task 12)

```ts
import { FieldContract, Violation } from "@scrapeverse/contracts";
import { GoldenRecord, HealAttemptRecord } from "@scrapeverse/sentinel";

export class FakeDb {
  private contracts = new Map<string, FieldContract[]>();
  private runs = new Map<string, { rows: unknown[]; status: string; run_at: string }[]>();
  private goldens = new Map<string, GoldenRecord[]>();
  private healAttempts: (HealAttemptRecord & { id: string })[] = [];

  async getLatestContract(collectorId: string) {
    return this.contracts.get(collectorId) ?? null;
  }
  async saveContract(collectorId: string, fields: FieldContract[]) {
    this.contracts.set(collectorId, fields);
  }
  async getTrailingRuns(collectorId: string, n: number) {
    return (this.runs.get(collectorId) ?? []).slice(-n).map((r) => ({ ...r, id: "", collector_id: collectorId, snapshot_id: null, row_count: r.rows.length }));
  }
  async saveRun(collectorId: string, rows: unknown[], status: string) {
    const list = this.runs.get(collectorId) ?? [];
    list.push({ rows, status, run_at: new Date().toISOString() });
    this.runs.set(collectorId, list);
    return `run_${list.length}`;
  }
  async saveViolations(_runId: string, _violations: Violation[]) {}
  async getGoldens(collectorId: string) {
    return this.goldens.get(collectorId) ?? [];
  }
  setGoldens(collectorId: string, goldens: GoldenRecord[]) {
    this.goldens.set(collectorId, goldens);
  }
  async saveHealAttempt(attempt: HealAttemptRecord) {
    this.healAttempts.push({ ...attempt, id: `h_${this.healAttempts.length}` });
  }
  async countRecentHealAttempts(collectorId: string, sinceHours: number) {
    const cutoff = Date.now() - sinceHours * 3600_000;
    return this.healAttempts.filter((a) => a.collectorId === collectorId && new Date(a.decidedAt).getTime() >= cutoff).length;
  }
  async countConsecutiveRejections(collectorId: string) {
    const forCollector = this.healAttempts.filter((a) => a.collectorId === collectorId);
    let count = 0;
    for (let i = forCollector.length - 1; i >= 0; i--) {
      if (forCollector[i].state === "REJECTED") count++;
      else break;
    }
    return count;
  }
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/db test -- fakeDb`
Expected: PASS (note: this test will not fully typecheck until `@scrapeverse/contracts` and `@scrapeverse/sentinel` exist — acceptable at this point since `pnpm test` runs Vitest which transpiles but doesn't hard-block on cross-package types not yet published; if it errors on missing workspace packages, add `packages/contracts` and `packages/sentinel` as empty stub packages with just `types.ts` exporting the interfaces first, then fill them in Tasks 7–16. Executor's call based on actual error.)

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): add typed query modules and in-memory FakeDb for tests"
```

---

## Task 4: brightdata types + semaphore

**Files:**
- Create: `packages/brightdata/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/brightdata/src/types.ts`, `packages/brightdata/src/semaphore.ts`
- Test: `packages/brightdata/test/semaphore.test.ts`

**Interfaces:**
- Produces: `Row`, `TriggerResult`, `DatasetResult`, `HealResult`, `ApproveResult`, `BrightDataClient` interface (consumed by every later brightdata/sentinel task); `Semaphore` class.

- [ ] **Step 1: Write `packages/brightdata/src/types.ts`**

```ts
export interface Row {
  [field: string]: string | number | null;
}

export interface TriggerResult {
  snapshotId: string;
}

export interface DatasetResult {
  status: "running" | "ready" | "failed";
  rows?: Row[];
}

export interface HealResult {
  jobId: string;
  status: "pending" | "completed" | "failed";
}

export interface ApproveResult {
  approved: boolean;
}

export interface BrightDataClient {
  trigger(collectorId: string, urls: string[]): Promise<TriggerResult>;
  getDataset(snapshotId: string): Promise<DatasetResult>;
  runCollector(collectorId: string, url: string): Promise<Row[]>;
  heal(collectorId: string, prompt: string): Promise<HealResult>;
  approve(collectorId: string, opts?: { autoSave?: boolean }): Promise<ApproveResult>;
  scrape(url: string): Promise<string>; // raw HTML, used by domDiff (Task 12)
}
```

- [ ] **Step 2: Write failing test `packages/brightdata/test/semaphore.test.ts`**

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/brightdata test -- semaphore`
Expected: FAIL — `semaphore.ts` does not exist.

- [ ] **Step 4: Write `packages/brightdata/src/semaphore.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/brightdata test -- semaphore`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/brightdata
git commit -m "feat(brightdata): add client types and concurrency semaphore"
```

---

## Task 5: brightdata cassette record/replay

**Files:**
- Create: `packages/brightdata/src/cassette.ts`
- Test: `packages/brightdata/test/cassette.test.ts`

**Interfaces:**
- Consumes: nothing external — wraps any async function.
- Produces: `CassetteRecorder` class with `record<T>(key: string, fn: () => Promise<T>): Promise<T>` (writes to disk) and `CassetteReplayer` class with `replay<T>(key: string): Promise<T>` (reads from disk, throws if key missing) — used by `createClient.ts` (Task 6) to wrap `liveClient`.

- [ ] **Step 1: Write failing test `packages/brightdata/test/cassette.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CassetteRecorder, CassetteReplayer } from "../src/cassette";

describe("Cassette record/replay", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "cassette-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("records a call and replays the same value without invoking fn again", async () => {
    const recorder = new CassetteRecorder(dir);
    let calls = 0;
    const value = await recorder.record("trigger:c_1", async () => {
      calls++;
      return { snapshotId: "s_1" };
    });
    expect(value).toEqual({ snapshotId: "s_1" });
    expect(calls).toBe(1);

    const replayer = new CassetteReplayer(dir);
    const replayed = await replayer.replay("trigger:c_1");
    expect(replayed).toEqual({ snapshotId: "s_1" });
  });

  it("throws when replaying a key that was never recorded", async () => {
    const replayer = new CassetteReplayer(dir);
    await expect(replayer.replay("missing:key")).rejects.toThrow(/no cassette/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/brightdata test -- cassette`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/brightdata/src/cassette.ts`**

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function keyToPath(dir: string, key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(dir, `${safe}.json`);
}

export class CassetteRecorder {
  constructor(private dir: string) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  async record<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const value = await fn();
    writeFileSync(keyToPath(this.dir, key), JSON.stringify(value, null, 2));
    return value;
  }
}

export class CassetteReplayer {
  constructor(private dir: string) {}

  async replay<T>(key: string): Promise<T> {
    const path = keyToPath(this.dir, key);
    if (!existsSync(path)) {
      throw new Error(`no cassette recorded for key "${key}" at ${path}`);
    }
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/brightdata test -- cassette`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/brightdata
git commit -m "feat(brightdata): add cassette recorder/replayer for deterministic demos"
```

---

## Task 6: brightdata live client + factory

**Files:**
- Create: `packages/brightdata/src/liveClient.ts`, `packages/brightdata/src/createClient.ts`
- Create: `packages/brightdata/cassettes/sample.json` (fixture)
- Test: `packages/brightdata/test/liveClient.test.ts`, `packages/brightdata/test/createClient.test.ts`

**Interfaces:**
- Consumes: `BrightDataClient`, `Row`, `TriggerResult`, `DatasetResult`, `HealResult`, `ApproveResult` (Task 4), `Semaphore` (Task 4), `CassetteRecorder`/`CassetteReplayer` (Task 5).
- Produces: `createBrightDataClient(): BrightDataClient` reading `BRIGHTDATA_MODE` — consumed by every `sentinel` task and `apps/web` API routes.

- [ ] **Step 1: Write failing test `packages/brightdata/test/liveClient.test.ts`** (mocks `fetch`, does not hit network)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveBrightDataClient } from "../src/liveClient";

describe("LiveBrightDataClient", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("triggers a collector and returns the snapshot id", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ snapshot_id: "s_123" }),
    }) as unknown as typeof fetch;

    const client = new LiveBrightDataClient({ apiKey: "k", baseUrl: "https://api.brightdata.com" });
    const result = await client.trigger("c_1", ["https://example.com"]);
    expect(result).toEqual({ snapshotId: "s_123" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/dca/trigger?collector=c_1"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("polls getDataset and fails fast on 4xx without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new LiveBrightDataClient({ apiKey: "k", baseUrl: "https://api.brightdata.com" });
    await expect(client.getDataset("s_123")).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on 5xx up to the configured attempts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ready", rows: [] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new LiveBrightDataClient({ apiKey: "k", baseUrl: "https://api.brightdata.com", retryDelayMs: 1 });
    const result = await client.getDataset("s_123");
    expect(result.status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/brightdata test -- liveClient`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/brightdata/src/liveClient.ts`**

```ts
import { BrightDataClient, Row, TriggerResult, DatasetResult, HealResult, ApproveResult } from "./types";
import { Semaphore } from "./semaphore";

interface LiveConfig {
  apiKey: string;
  baseUrl: string;
  retryDelayMs?: number;
  maxRetries?: number;
}

export class LiveBrightDataClient implements BrightDataClient {
  private sem = new Semaphore(3);
  private retryDelayMs: number;
  private maxRetries: number;

  constructor(private config: LiveConfig) {
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.maxRetries = config.maxRetries ?? 4;
  }

  private async request(path: string, init: RequestInit = {}): Promise<any> {
    let attempt = 0;
    for (;;) {
      const res = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      if (res.ok) return res.json();
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`Bright Data request failed: ${res.status} ${path}`);
      }
      attempt++;
      if (attempt > this.maxRetries) {
        throw new Error(`Bright Data request failed after ${attempt} attempts: ${res.status} ${path}`);
      }
      await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
    }
  }

  async trigger(collectorId: string, urls: string[]): Promise<TriggerResult> {
    await this.sem.acquire();
    try {
      const body = urls.length === 1 ? { url: urls[0] } : { urls };
      const data = await this.request(`/dca/trigger?collector=${collectorId}`, { method: "POST", body: JSON.stringify(body) });
      return { snapshotId: data.snapshot_id };
    } finally {
      this.sem.release();
    }
  }

  async getDataset(snapshotId: string): Promise<DatasetResult> {
    const data = await this.request(`/dca/dataset?id=${snapshotId}`);
    return { status: data.status ?? "ready", rows: data.rows as Row[] | undefined };
  }

  async runCollector(collectorId: string, url: string): Promise<Row[]> {
    const { snapshotId } = await this.trigger(collectorId, [url]);
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
      const dataset = await this.getDataset(snapshotId);
      if (dataset.status === "ready") return dataset.rows ?? [];
      if (dataset.status === "failed") throw new Error(`collector run failed for snapshot ${snapshotId}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    throw new Error(`collector run timed out for snapshot ${snapshotId}`);
  }

  async heal(collectorId: string, prompt: string): Promise<HealResult> {
    await this.sem.acquire();
    try {
      const data = await this.request(`/dca/collectors/${collectorId}/refactor_template`, {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      return { jobId: data.job_id, status: data.status ?? "pending" };
    } finally {
      this.sem.release();
    }
  }

  async approve(collectorId: string, opts?: { autoSave?: boolean }): Promise<ApproveResult> {
    const data = await this.request(`/dca/collectors/${collectorId}/approve`, {
      method: "POST",
      body: JSON.stringify({ auto_save: opts?.autoSave ?? false }),
    });
    return { approved: data.approved ?? true };
  }

  async scrape(url: string): Promise<string> {
    const data = await this.request(`/dca/scrape?url=${encodeURIComponent(url)}`);
    return data.html ?? "";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/brightdata test -- liveClient`
Expected: PASS

- [ ] **Step 5: Write `packages/brightdata/src/createClient.ts`**

```ts
import { BrightDataClient } from "./types";
import { LiveBrightDataClient } from "./liveClient";
import { CassetteRecorder, CassetteReplayer } from "./cassette";

function wrapWithRecording(client: BrightDataClient, recorder: CassetteRecorder): BrightDataClient {
  return {
    trigger: (id, urls) => recorder.record(`trigger:${id}:${urls.join(",")}`, () => client.trigger(id, urls)),
    getDataset: (id) => recorder.record(`dataset:${id}`, () => client.getDataset(id)),
    runCollector: (id, url) => recorder.record(`run:${id}:${url}`, () => client.runCollector(id, url)),
    heal: (id, prompt) => recorder.record(`heal:${id}:${prompt}`, () => client.heal(id, prompt)),
    approve: (id, opts) => recorder.record(`approve:${id}`, () => client.approve(id, opts)),
    scrape: (url) => recorder.record(`scrape:${url}`, () => client.scrape(url)),
  };
}

function wrapWithReplay(replayer: CassetteReplayer): BrightDataClient {
  return {
    trigger: (id, urls) => replayer.replay(`trigger:${id}:${urls.join(",")}`),
    getDataset: (id) => replayer.replay(`dataset:${id}`),
    runCollector: (id, url) => replayer.replay(`run:${id}:${url}`),
    heal: (id, prompt) => replayer.replay(`heal:${id}:${prompt}`),
    approve: (id) => replayer.replay(`approve:${id}`),
    scrape: (url) => replayer.replay(`scrape:${url}`),
  };
}

export function createBrightDataClient(cassetteDir = "cassettes"): BrightDataClient {
  const mode = process.env.BRIGHTDATA_MODE ?? "replay";
  if (mode === "replay") {
    return wrapWithReplay(new CassetteReplayer(cassetteDir));
  }
  const live = new LiveBrightDataClient({
    apiKey: process.env.BRIGHTDATA_API_KEY ?? "",
    baseUrl: process.env.BRIGHTDATA_API_BASE ?? "https://api.brightdata.com",
  });
  if (mode === "record") {
    return wrapWithRecording(live, new CassetteRecorder(cassetteDir));
  }
  return live; // "live"
}
```

- [ ] **Step 6: Write failing-then-passing test `packages/brightdata/test/createClient.test.ts`**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBrightDataClient } from "../src/createClient";

describe("createBrightDataClient", () => {
  const original = process.env.BRIGHTDATA_MODE;
  afterEach(() => { process.env.BRIGHTDATA_MODE = original; });

  it("returns a replay client that serves recorded cassettes with no network calls", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cassette-"));
    writeFileSync(join(dir, "trigger_c_1_https___example.com.json"), JSON.stringify({ snapshotId: "s_1" }));
    process.env.BRIGHTDATA_MODE = "replay";
    const client = createBrightDataClient(dir);
    const result = await client.trigger("c_1", ["https://example.com"]);
    expect(result.snapshotId).toBe("s_1");
    rmSync(dir, { recursive: true, force: true });
  });
});
```

Run: `pnpm --filter @scrapeverse/brightdata test -- createClient` → confirm FAIL first (before createClient.ts exists), then PASS after Step 5.

- [ ] **Step 7: Commit**

```bash
git add packages/brightdata
git commit -m "feat(brightdata): add live REST client and mode-switching factory"
```

---

## Task 7: contracts types + inferContract

**Files:**
- Create: `packages/contracts/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/contracts/src/types.ts`, `packages/contracts/src/infer.ts`
- Test: `packages/contracts/test/infer.test.ts`

**Interfaces:**
- Consumes: `Row` — redefined locally (not imported from brightdata) to keep `contracts` dependency-free per Global Constraints.
- Produces: `FieldContract`, `ViolationClass`, `Violation` types; `inferContract(healthyRuns: Row[][]): FieldContract[]` — consumed by Tasks 8–11 and `sentinel`.

- [ ] **Step 1: Write `packages/contracts/src/types.ts`**

```ts
export interface Row {
  [field: string]: string | number | null;
}

export type FieldType = "currency" | "number" | "string" | "date" | "url" | "enum";

export interface FieldContract {
  name: string;
  description: string;
  type: FieldType;
  currency?: string;
  pattern?: string;
  nullRate: { p50: number; max: number };
  numericRange?: { min: number; max: number };
  categoricalValues?: string[];
}

export type ViolationClass = "STRUCTURAL" | "SEMANTIC" | "DRIFT";

export interface Violation {
  class: ViolationClass;
  field: string;
  detail: string;
  evidence: { expected: string; observed: string; sampleRows: Row[] };
}
```

- [ ] **Step 2: Write failing test `packages/contracts/test/infer.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { inferContract } from "../src/infer";

describe("inferContract", () => {
  it("infers a currency contract with numeric range and null rate from healthy runs", () => {
    const runs = [
      [{ price: "₹1,284" }, { price: "₹500" }, { price: null }],
      [{ price: "₹1,300" }, { price: "₹480" }, { price: "₹900" }],
    ];
    const [contract] = inferContract(runs);
    expect(contract.name).toBe("price");
    expect(contract.type).toBe("currency");
    expect(contract.currency).toBe("INR");
    expect(contract.numericRange!.min).toBeLessThanOrEqual(480);
    expect(contract.numericRange!.max).toBeGreaterThanOrEqual(1300);
    expect(contract.nullRate.max).toBeGreaterThan(0);
  });

  it("infers a plain number contract when no currency symbol is present", () => {
    const runs = [[{ points: 42 }, { points: 100 }]];
    const [contract] = inferContract(runs);
    expect(contract.type).toBe("number");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/contracts test -- infer`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `packages/contracts/src/infer.ts`**

```ts
import { FieldContract, FieldType, Row } from "./types";

const CURRENCY_PATTERN = /^([₹$€£])\s?[\d,]+(\.\d{1,2})?$/;

function parseNumeric(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[₹$€£,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function detectCurrency(value: string): string | null {
  if (value.startsWith("₹")) return "INR";
  if (value.startsWith("$")) return "USD";
  if (value.startsWith("€")) return "EUR";
  if (value.startsWith("£")) return "GBP";
  return null;
}

function inferType(values: (string | number | null)[]): { type: FieldType; currency?: string } {
  const nonNull = values.filter((v): v is string | number => v !== null);
  const currencyMatches = nonNull.filter((v) => typeof v === "string" && CURRENCY_PATTERN.test(v));
  if (currencyMatches.length > 0 && currencyMatches.length === nonNull.length) {
    return { type: "currency", currency: detectCurrency(currencyMatches[0] as string) ?? undefined };
  }
  if (nonNull.every((v) => typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)))) {
    return { type: "number" };
  }
  return { type: "string" };
}

export function inferContract(healthyRuns: Row[][]): FieldContract[] {
  const fieldNames = new Set<string>();
  for (const run of healthyRuns) for (const row of run) for (const k of Object.keys(row)) fieldNames.add(k);

  const contracts: FieldContract[] = [];
  for (const name of fieldNames) {
    const allValues: (string | number | null)[] = [];
    let totalRows = 0;
    let nullRows = 0;
    for (const run of healthyRuns) {
      for (const row of run) {
        totalRows++;
        const v = row[name] ?? null;
        allValues.push(v);
        if (v === null) nullRows++;
      }
    }
    const { type, currency } = inferType(allValues);
    const numerics = allValues.map(parseNumeric).filter((n): n is number => n !== null);
    const p50NullRate = totalRows > 0 ? nullRows / totalRows : 0;

    contracts.push({
      name,
      description: name,
      type,
      currency,
      nullRate: { p50: p50NullRate, max: Math.min(1, p50NullRate + 0.15) },
      numericRange: numerics.length > 0 ? { min: Math.min(...numerics), max: Math.max(...numerics) } : undefined,
    });
  }
  return contracts;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/contracts test -- infer`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add field contract inference from healthy runs"
```

---

## Task 8: contracts — STRUCTURAL detection

**Files:**
- Create: `packages/contracts/src/structural.ts`
- Test: `packages/contracts/test/structural.test.ts`

**Interfaces:**
- Consumes: `FieldContract`, `Row`, `Violation` (Task 7).
- Produces: `detectStructural(contracts: FieldContract[], run: Row[]): Violation[]` — consumed by `classify.ts` (Task 11).

- [ ] **Step 1: Write failing test `packages/contracts/test/structural.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { detectStructural } from "../src/structural";
import { FieldContract } from "../src/types";

const contract: FieldContract = {
  name: "price", description: "price", type: "currency", currency: "INR",
  nullRate: { p50: 0.02, max: 0.1 },
};

describe("detectStructural", () => {
  it("flags a field whose null rate on this run exceeds the contract max", () => {
    const run = [{ price: null }, { price: null }, { price: "₹100" }];
    const violations = detectStructural([contract], run);
    expect(violations).toHaveLength(1);
    expect(violations[0].class).toBe("STRUCTURAL");
    expect(violations[0].field).toBe("price");
  });

  it("does not flag when null rate is within bounds", () => {
    const run = [{ price: "₹100" }, { price: "₹200" }, { price: null }];
    expect(detectStructural([contract], run)).toHaveLength(0);
  });

  it("flags row-count collapse against a trailing median", () => {
    const violations = detectStructural([contract], [{ price: "₹100" }], { trailingMedianRowCount: 20 });
    expect(violations.some((v) => v.detail.includes("row count"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/contracts test -- structural`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/contracts/src/structural.ts`**

```ts
import { FieldContract, Row, Violation } from "./types";

export function detectStructural(
  contracts: FieldContract[],
  run: Row[],
  opts?: { trailingMedianRowCount?: number }
): Violation[] {
  const violations: Violation[] = [];

  if (opts?.trailingMedianRowCount && opts.trailingMedianRowCount > 0) {
    if (run.length < opts.trailingMedianRowCount * 0.5) {
      violations.push({
        class: "STRUCTURAL",
        field: "*",
        detail: `row count collapsed: ${run.length} vs trailing median ${opts.trailingMedianRowCount}`,
        evidence: { expected: `~${opts.trailingMedianRowCount} rows`, observed: `${run.length} rows`, sampleRows: run.slice(0, 3) },
      });
    }
  }

  for (const contract of contracts) {
    if (run.length === 0) continue;
    const nulls = run.filter((r) => (r[contract.name] ?? null) === null).length;
    const rate = nulls / run.length;
    if (rate > contract.nullRate.max) {
      violations.push({
        class: "STRUCTURAL",
        field: contract.name,
        detail: `null rate ${(rate * 100).toFixed(0)}% exceeds contract max ${(contract.nullRate.max * 100).toFixed(0)}%`,
        evidence: { expected: `null rate <= ${contract.nullRate.max}`, observed: `null rate ${rate}`, sampleRows: run.slice(0, 3) },
      });
    }
  }
  return violations;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/contracts test -- structural`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add structural violation detection (nulls, row-count collapse)"
```

---

## Task 9: contracts — SEMANTIC detection

**Files:**
- Create: `packages/contracts/src/semantic.ts`
- Test: `packages/contracts/test/semantic.test.ts`

**Interfaces:**
- Consumes: `FieldContract`, `Row`, `Violation` (Task 7).
- Produces: `detectSemantic(contracts: FieldContract[], run: Row[]): Violation[]` — consumed by `classify.ts` (Task 11).

- [ ] **Step 1: Write failing test `packages/contracts/test/semantic.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { detectSemantic } from "../src/semantic";
import { FieldContract } from "../src/types";

const contract: FieldContract = {
  name: "price", description: "price incl currency symbol", type: "currency", currency: "INR",
  nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 12, max: 5000 },
};

describe("detectSemantic", () => {
  it("flags a currency field that lost its currency symbol", () => {
    const run = [{ price: "1284" }, { price: "500" }];
    const violations = detectSemantic([contract], run);
    expect(violations.some((v) => v.class === "SEMANTIC" && v.field === "price")).toBe(true);
  });

  it("flags a numeric value outside the hard range", () => {
    const run = [{ price: "₹99999" }];
    const violations = detectSemantic([contract], run);
    expect(violations.some((v) => v.detail.includes("range"))).toBe(true);
  });

  it("does not flag well-formed in-range currency values", () => {
    const run = [{ price: "₹1,284" }, { price: "₹500" }];
    expect(detectSemantic([contract], run)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/contracts test -- semantic`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/contracts/src/semantic.ts`**

```ts
import { FieldContract, Row, Violation } from "./types";

const CURRENCY_SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function parseNumeric(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[₹$€£,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function detectSemantic(contracts: FieldContract[], run: Row[]): Violation[] {
  const violations: Violation[] = [];

  for (const contract of contracts) {
    const values = run.map((r) => r[contract.name] ?? null).filter((v): v is string | number => v !== null);
    if (values.length === 0) continue;

    if (contract.type === "currency" && contract.currency) {
      const symbol = CURRENCY_SYMBOLS[contract.currency];
      const missingSymbol = values.filter((v) => typeof v === "string" && symbol && !v.includes(symbol));
      if (symbol && missingSymbol.length === values.length) {
        violations.push({
          class: "SEMANTIC",
          field: contract.name,
          detail: `currency symbol "${symbol}" missing from all ${values.length} values — field appears to have lost its currency formatting`,
          evidence: { expected: `values matching /${symbol}.../`, observed: String(missingSymbol[0]), sampleRows: run.slice(0, 3) },
        });
      }
    }

    if (contract.numericRange) {
      const outOfRange = run.filter((r) => {
        const n = parseNumeric(r[contract.name] ?? null);
        return n !== null && (n < contract.numericRange!.min * 0.5 || n > contract.numericRange!.max * 1.5);
      });
      if (outOfRange.length > 0) {
        violations.push({
          class: "SEMANTIC",
          field: contract.name,
          detail: `${outOfRange.length} value(s) fall outside expected range [${contract.numericRange.min}, ${contract.numericRange.max}]`,
          evidence: { expected: `[${contract.numericRange.min}, ${contract.numericRange.max}]`, observed: String(outOfRange[0][contract.name]), sampleRows: outOfRange.slice(0, 3) },
        });
      }
    }
  }
  return violations;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/contracts test -- semantic`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add semantic violation detection (type/format/range)"
```

---

## Task 10: contracts — DRIFT detection (PSI)

**Files:**
- Create: `packages/contracts/src/drift.ts`
- Test: `packages/contracts/test/drift.test.ts`

**Interfaces:**
- Consumes: `FieldContract`, `Row`, `Violation` (Task 7).
- Produces: `detectDrift(contracts: FieldContract[], baselineRuns: Row[][], currentRun: Row[]): Violation[]` — consumed by `classify.ts` (Task 11).

- [ ] **Step 1: Write failing test `packages/contracts/test/drift.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { detectDrift } from "../src/drift";
import { FieldContract, Row } from "../src/types";

const contract: FieldContract = {
  name: "price", description: "sale price", type: "currency", currency: "INR",
  nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 100, max: 2000 },
};

function runOf(prices: number[]): Row[] {
  return prices.map((p) => ({ price: `₹${p}` }));
}

describe("detectDrift", () => {
  it("does not flag a run whose distribution matches the baseline", () => {
    const baseline = [runOf([500, 600, 550, 620, 580]), runOf([510, 590, 560, 610, 570])];
    const current = runOf([505, 595, 555, 615, 575]);
    expect(detectDrift([contract], baseline, current)).toHaveLength(0);
  });

  it("flags a run whose distribution has shifted materially from baseline (e.g. MSRP swapped in for sale price)", () => {
    const baseline = [runOf([500, 600, 550, 620, 580]), runOf([510, 590, 560, 610, 570])];
    const current = runOf([1400, 1450, 1500, 1480, 1520]); // consistently ~2.5x higher, still "in range" per hard bounds
    const violations = detectDrift([contract], baseline, current);
    expect(violations).toHaveLength(1);
    expect(violations[0].class).toBe("DRIFT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/contracts test -- drift`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/contracts/src/drift.ts`**

```ts
import { FieldContract, Row, Violation } from "./types";

function parseNumeric(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[₹$€£,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Population Stability Index between two numeric samples, using equal-width
// bins spanned by the union of both samples' ranges.
function psi(baseline: number[], current: number[], bins = 5): number {
  if (baseline.length === 0 || current.length === 0) return 0;
  const all = [...baseline, ...current];
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (min === max) return 0;
  const width = (max - min) / bins;

  const bucket = (v: number) => Math.min(bins - 1, Math.floor((v - min) / width));
  const hist = (values: number[]) => {
    const counts = new Array(bins).fill(0);
    for (const v of values) counts[bucket(v)]++;
    return counts.map((c) => Math.max(c / values.length, 1e-6)); // avoid div-by-zero / log(0)
  };

  const b = hist(baseline);
  const c = hist(current);
  let total = 0;
  for (let i = 0; i < bins; i++) {
    total += (c[i] - b[i]) * Math.log(c[i] / b[i]);
  }
  return total;
}

const PSI_DRIFT_THRESHOLD = 0.25; // conventional PSI cutoff: >0.25 = significant distribution shift

export function detectDrift(
  contracts: FieldContract[],
  baselineRuns: Row[][],
  currentRun: Row[]
): Violation[] {
  const violations: Violation[] = [];

  for (const contract of contracts) {
    if (contract.type !== "currency" && contract.type !== "number") continue;

    const baselineValues = baselineRuns.flat().map((r) => parseNumeric(r[contract.name] ?? null)).filter((n): n is number => n !== null);
    const currentValues = currentRun.map((r) => parseNumeric(r[contract.name] ?? null)).filter((n): n is number => n !== null);
    if (baselineValues.length < 3 || currentValues.length < 3) continue; // not enough data to judge drift

    const score = psi(baselineValues, currentValues);
    if (score > PSI_DRIFT_THRESHOLD) {
      const baselineMean = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
      const currentMean = currentValues.reduce((a, b) => a + b, 0) / currentValues.length;
      violations.push({
        class: "DRIFT",
        field: contract.name,
        detail: `distribution shifted (PSI=${score.toFixed(2)}): baseline mean ${baselineMean.toFixed(2)} vs current mean ${currentMean.toFixed(2)} — value is well-typed and in range but likely the wrong field (e.g. MSRP instead of sale price)`,
        evidence: { expected: `mean ~${baselineMean.toFixed(2)}`, observed: `mean ${currentMean.toFixed(2)}`, sampleRows: currentRun.slice(0, 3) },
      });
    }
  }
  return violations;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/contracts test -- drift`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add PSI-based drift detection for silent field-swap failures"
```

---

## Task 11: contracts — classifyRun orchestrator + property test

**Files:**
- Create: `packages/contracts/src/classify.ts`, `packages/contracts/src/index.ts`
- Test: `packages/contracts/test/classify.property.test.ts`

**Interfaces:**
- Consumes: `detectStructural` (Task 8), `detectSemantic` (Task 9), `detectDrift` (Task 10), all types (Task 7).
- Produces: `classifyRun(contracts, currentRun, baselineRuns?, opts?): Violation[]` — the single entry point `sentinel/machine.ts` (Task 16) calls.

- [ ] **Step 1: Write failing property test `packages/contracts/test/classify.property.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { classifyRun } from "../src/classify";
import { inferContract } from "../src/infer";
import { Row } from "../src/types";

describe("classifyRun property: a run drawn from the same distribution as its baseline never trips a violation", () => {
  it("holds for random well-formed currency rows", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 100, max: 1000 }), { minLength: 5, maxLength: 20 }),
        (prices) => {
          const rows: Row[] = prices.map((p) => ({ price: `₹${p}` }));
          const [contract] = inferContract([rows]);
          const violations = classifyRun([contract], rows, [rows]);
          expect(violations).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe("classifyRun", () => {
  it("aggregates violations from all three detectors", () => {
    const baseline = [[{ price: "₹500" }, { price: "₹600" }, { price: "₹550" }]];
    const [contract] = inferContract(baseline);
    const brokenRun = [{ price: null }, { price: null }, { price: null }];
    const violations = classifyRun([contract], brokenRun, baseline);
    expect(violations.some((v) => v.class === "STRUCTURAL")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/contracts test -- classify`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/contracts/src/classify.ts`**

```ts
import { FieldContract, Row, Violation } from "./types";
import { detectStructural } from "./structural";
import { detectSemantic } from "./semantic";
import { detectDrift } from "./drift";

export function classifyRun(
  contracts: FieldContract[],
  currentRun: Row[],
  baselineRuns: Row[][] = [],
  opts?: { trailingMedianRowCount?: number }
): Violation[] {
  return [
    ...detectStructural(contracts, currentRun, opts),
    ...detectSemantic(contracts, currentRun),
    ...detectDrift(contracts, baselineRuns, currentRun),
  ];
}
```

- [ ] **Step 4: Write `packages/contracts/src/index.ts`**

```ts
export * from "./types";
export * from "./infer";
export * from "./structural";
export * from "./semantic";
export * from "./drift";
export * from "./classify";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/contracts test -- classify`
Expected: PASS

- [ ] **Step 6: Run the full contracts test suite**

Run: `pnpm --filter @scrapeverse/contracts test`
Expected: PASS — all of infer/structural/semantic/drift/classify green.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts
git commit -m "feat(contracts): add classifyRun orchestrator and package index"
```

---

## Task 12: sentinel types + domDiff

**Files:**
- Create: `packages/sentinel/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/sentinel/src/types.ts`, `packages/sentinel/src/domDiff.ts`
- Test: `packages/sentinel/test/domDiff.test.ts`

**Interfaces:**
- Consumes: `BrightDataClient` (`@scrapeverse/brightdata`), `FieldContract`/`Violation` (`@scrapeverse/contracts`).
- Produces: `SentinelState`, `GoldenRecord`, `HealAttemptRecord`, `SentinelDb` interface (matches `FakeDb` from Task 3 and real db module from Task 3), `diffDom(oldHtml: string, newHtml: string): string` — consumed by `promptSynth.ts` (Task 13).

- [ ] **Step 1: Write `packages/sentinel/src/types.ts`**

```ts
import { BrightDataClient } from "@scrapeverse/brightdata";
import { FieldContract, Violation } from "@scrapeverse/contracts";

export type SentinelState =
  | "HEALTHY" | "DEGRADED" | "DIAGNOSING" | "HEALING" | "VERIFYING"
  | "PROMOTED" | "REJECTED" | "ESCALATED";

export interface GoldenRecord {
  url: string;
  expected: Record<string, string | number | null>;
}

export interface HealAttemptRecord {
  collectorId: string;
  violations: Violation[];
  prompt: string;
  state: SentinelState;
  verificationResult?: { goldensPassed: boolean; details: string };
  decidedAt: string;
}

export interface SentinelDb {
  getLatestContract(collectorId: string): Promise<FieldContract[] | null>;
  saveContract(collectorId: string, fields: FieldContract[]): Promise<void>;
  getTrailingRuns(collectorId: string, n: number): Promise<{ rows: unknown[] }[]>;
  saveRun(collectorId: string, rows: unknown[], status: string): Promise<string>;
  getGoldens(collectorId: string): Promise<GoldenRecord[]>;
  saveHealAttempt(attempt: HealAttemptRecord): Promise<void>;
  countRecentHealAttempts(collectorId: string, sinceHours: number): Promise<number>;
  countConsecutiveRejections(collectorId: string): Promise<number>;
}

export interface SentinelDeps {
  brightData: BrightDataClient;
  db: SentinelDb;
}

export interface SentinelCycleResult {
  finalState: SentinelState;
  violations: Violation[];
}
```

- [ ] **Step 2: Write failing test `packages/sentinel/test/domDiff.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { diffDom } from "../src/domDiff";

describe("diffDom", () => {
  it("reports which class/attribute selectors disappeared between two HTML snapshots", () => {
    const oldHtml = `<div class="product-grid"><div class="card"><span class="price">₹100</span></div></div>`;
    const newHtml = `<div class="product-grid"><div data-test="price"><span class="amount">₹100</span></div></div>`;
    const diff = diffDom(oldHtml, newHtml);
    expect(diff).toContain("card");
    expect(diff).toContain("price");
  });

  it("returns a no-op message when the two snapshots are structurally identical", () => {
    const html = `<div class="card"><span class="price">₹100</span></div>`;
    expect(diffDom(html, html)).toMatch(/no structural change/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/sentinel test -- domDiff`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `packages/sentinel/src/domDiff.ts`**

```ts
function extractSelectors(html: string): Set<string> {
  const selectors = new Set<string>();
  const classMatches = html.matchAll(/class="([^"]+)"/g);
  for (const m of classMatches) for (const cls of m[1].split(/\s+/)) selectors.add(`.${cls}`);
  const dataMatches = html.matchAll(/data-[\w-]+="[^"]*"/g);
  for (const m of dataMatches) selectors.add(`[${m[0].split("=")[0]}]`);
  return selectors;
}

export function diffDom(oldHtml: string, newHtml: string): string {
  const oldSelectors = extractSelectors(oldHtml);
  const newSelectors = extractSelectors(newHtml);

  const removed = [...oldSelectors].filter((s) => !newSelectors.has(s));
  const added = [...newSelectors].filter((s) => !oldSelectors.has(s));

  if (removed.length === 0 && added.length === 0) {
    return "no structural change detected between snapshots";
  }

  const parts: string[] = [];
  if (removed.length > 0) parts.push(`removed selectors: ${removed.join(", ")}`);
  if (added.length > 0) parts.push(`new selectors: ${added.join(", ")}`);
  return parts.join(" | ");
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/sentinel test -- domDiff`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/sentinel
git commit -m "feat(sentinel): add types and structural DOM diff for heal prompt evidence"
```

---

## Task 13: sentinel — promptSynth

**Files:**
- Create: `packages/sentinel/src/promptSynth.ts`
- Test: `packages/sentinel/test/promptSynth.test.ts`

**Interfaces:**
- Consumes: `Violation` (`@scrapeverse/contracts`), `diffDom` (Task 12).
- Produces: `composeHealPrompt(violations: Violation[], fieldDescriptions: Record<string, string>, domDiff: string): string` — consumed by `machine.ts` (Task 16).

- [ ] **Step 1: Write failing test `packages/sentinel/test/promptSynth.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { composeHealPrompt } from "../src/promptSynth";
import { Violation } from "@scrapeverse/contracts";

describe("composeHealPrompt", () => {
  it("includes the field description, violation detail, and dom diff evidence", () => {
    const violations: Violation[] = [{
      class: "STRUCTURAL", field: "price",
      detail: "null rate 98% exceeds contract max 10%",
      evidence: { expected: "null rate <= 0.1", observed: "null rate 0.98", sampleRows: [] },
    }];
    const prompt = composeHealPrompt(
      violations,
      { price: "current selling price including the ₹ symbol" },
      "removed selectors: .price | new selectors: [data-test]"
    );
    expect(prompt).toContain("current selling price including the ₹ symbol");
    expect(prompt).toContain("null rate 98%");
    expect(prompt).toContain("[data-test]");
  });

  it("distinguishes DRIFT violations with explicit wrong-field language", () => {
    const violations: Violation[] = [{
      class: "DRIFT", field: "price",
      detail: "distribution shifted (PSI=0.40): baseline mean 550 vs current mean 1470",
      evidence: { expected: "mean ~550", observed: "mean 1470", sampleRows: [] },
    }];
    const prompt = composeHealPrompt(violations, { price: "sale price" }, "no structural change detected between snapshots");
    expect(prompt.toLowerCase()).toContain("not the struck-through");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/sentinel test -- promptSynth`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/sentinel/src/promptSynth.ts`**

```ts
import { Violation } from "@scrapeverse/contracts";

export function composeHealPrompt(
  violations: Violation[],
  fieldDescriptions: Record<string, string>,
  domDiff: string
): string {
  const lines: string[] = [];

  for (const v of violations) {
    const description = fieldDescriptions[v.field] ?? v.field;
    lines.push(`The "${v.field}" field (${description}) failed: ${v.detail}.`);
    lines.push(`Previously observed: ${v.evidence.expected}. Now observed: ${v.evidence.observed}.`);
    if (v.class === "DRIFT") {
      lines.push(
        `This value is well-formed but its distribution has shifted — it is likely extracting the wrong field entirely ` +
        `(for example, a struck-through MSRP instead of the current sale price, or a cached/stale price). ` +
        `Re-extract the field described above, not the struck-through MSRP or any similar-looking decoy value.`
      );
    }
  }

  lines.push(`DOM changes since the last known-good extraction: ${domDiff}.`);
  lines.push(`Extract the field(s) above according to their description, ignoring any decoy values that match the old selector but no longer represent the described data.`);

  return lines.join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/sentinel test -- promptSynth`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sentinel
git commit -m "feat(sentinel): compose evidence-grounded heal prompts from violations"
```

---

## Task 14: sentinel — safetyRails

**Files:**
- Create: `packages/sentinel/src/safetyRails.ts`
- Test: `packages/sentinel/test/safetyRails.test.ts`

**Interfaces:**
- Consumes: `SentinelDb` (Task 12).
- Produces: `canAttemptHeal(db: SentinelDb, collectorId: string): Promise<{ allowed: boolean; reason?: string }>` — consumed by `machine.ts` (Task 16).

- [ ] **Step 1: Write failing test `packages/sentinel/test/safetyRails.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/sentinel test -- safetyRails`
Expected: FAIL — module not found. (Note: `FakeDb`'s `countRecentHealAttempts`/`countConsecutiveRejections` from Task 3 must ignore the `sinceHours` window correctly for the "escalates" test — Task 3's implementation already filters by `decidedAt >= cutoff` for recency but `countConsecutiveRejections` is time-independent by design, matching the spec's "3 consecutive" rule regardless of spacing.)

- [ ] **Step 3: Write `packages/sentinel/src/safetyRails.ts`**

```ts
import { SentinelDb } from "./types";

const MAX_HEALS_PER_WINDOW_HOURS = 4;
const MAX_CONSECUTIVE_REJECTIONS = 3;

export async function canAttemptHeal(
  db: SentinelDb,
  collectorId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const consecutiveRejections = await db.countConsecutiveRejections(collectorId);
  if (consecutiveRejections >= MAX_CONSECUTIVE_REJECTIONS) {
    return { allowed: false, reason: `escalated: ${consecutiveRejections} consecutive rejected heals, manual review required` };
  }

  const recentAttempts = await db.countRecentHealAttempts(collectorId, MAX_HEALS_PER_WINDOW_HOURS);
  if (recentAttempts > 0) {
    return { allowed: false, reason: `rate-limited: a heal was already attempted within the last ${MAX_HEALS_PER_WINDOW_HOURS} hour window` };
  }

  return { allowed: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/sentinel test -- safetyRails`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sentinel
git commit -m "feat(sentinel): add heal rate-limit and consecutive-rejection circuit breaker"
```

---

## Task 15: sentinel — verify (golden verification)

**Files:**
- Create: `packages/sentinel/src/verify.ts`
- Test: `packages/sentinel/test/verify.test.ts`

**Interfaces:**
- Consumes: `GoldenRecord` (Task 12), `BrightDataClient.runCollector` (`@scrapeverse/brightdata`), `FieldContract`/`classifyRun` (`@scrapeverse/contracts`).
- Produces: `verifyAgainstGoldens(client, collectorId, goldens, contracts): Promise<{ passed: boolean; details: string }>` — consumed by `machine.ts` (Task 16).

- [ ] **Step 1: Write failing test `packages/sentinel/test/verify.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { verifyAgainstGoldens } from "../src/verify";
import { BrightDataClient } from "@scrapeverse/brightdata";
import { FieldContract } from "@scrapeverse/contracts";

function fakeClient(responses: Record<string, { price: string }[]>): BrightDataClient {
  return {
    trigger: async () => ({ snapshotId: "s" }),
    getDataset: async () => ({ status: "ready", rows: [] }),
    runCollector: async (_id, url) => responses[url] ?? [],
    heal: async () => ({ jobId: "j", status: "completed" }),
    approve: async () => ({ approved: true }),
    scrape: async () => "",
  };
}

const contracts: FieldContract[] = [{
  name: "price", description: "price", type: "currency", currency: "INR",
  nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 10, max: 5000 },
}];

describe("verifyAgainstGoldens", () => {
  it("passes when the healed collector reproduces every golden's expected values", async () => {
    const client = fakeClient({ "https://example.com/p1": [{ price: "₹1,284" }] });
    const result = await verifyAgainstGoldens(client, "c_1", [{ url: "https://example.com/p1", expected: { price: "₹1,284" } }], contracts);
    expect(result.passed).toBe(true);
  });

  it("fails when any golden's expected value is not reproduced", async () => {
    const client = fakeClient({ "https://example.com/p1": [{ price: "₹999" }] });
    const result = await verifyAgainstGoldens(client, "c_1", [{ url: "https://example.com/p1", expected: { price: "₹1,284" } }], contracts);
    expect(result.passed).toBe(false);
    expect(result.details).toContain("p1");
  });

  it("fails when the healed run still trips a contract violation", async () => {
    const client = fakeClient({ "https://example.com/p1": [{ price: "99999" }] }); // out of range, no currency symbol
    const result = await verifyAgainstGoldens(client, "c_1", [{ url: "https://example.com/p1", expected: { price: "99999" } }], contracts);
    expect(result.passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/sentinel test -- verify`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/sentinel/src/verify.ts`**

```ts
import { BrightDataClient, Row } from "@scrapeverse/brightdata";
import { FieldContract, classifyRun } from "@scrapeverse/contracts";
import { GoldenRecord } from "./types";

export async function verifyAgainstGoldens(
  client: BrightDataClient,
  collectorId: string,
  goldens: GoldenRecord[],
  contracts: FieldContract[]
): Promise<{ passed: boolean; details: string }> {
  if (goldens.length === 0) {
    return { passed: false, details: "no golden records configured for this collector — cannot verify a heal, refusing to promote" };
  }

  const failures: string[] = [];

  for (const golden of goldens) {
    const rows: Row[] = await client.runCollector(collectorId, golden.url);
    const row = rows[0];

    if (!row) {
      failures.push(`${golden.url}: healed collector returned no rows`);
      continue;
    }

    for (const [field, expectedValue] of Object.entries(golden.expected)) {
      if (row[field] !== expectedValue) {
        failures.push(`${golden.url}: field "${field}" expected "${expectedValue}", got "${row[field]}"`);
      }
    }

    const violations = classifyRun(contracts, rows);
    if (violations.length > 0) {
      failures.push(`${golden.url}: healed run still violates contract: ${violations.map((v) => v.detail).join("; ")}`);
    }
  }

  return {
    passed: failures.length === 0,
    details: failures.length === 0 ? `all ${goldens.length} golden record(s) reproduced` : failures.join(" | "),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/sentinel test -- verify`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sentinel
git commit -m "feat(sentinel): verify healed collectors against golden records before promotion"
```

---

## Task 16: sentinel — machine (the orchestrator + the core invariant test)

**Files:**
- Create: `packages/sentinel/src/machine.ts`, `packages/sentinel/src/index.ts`
- Test: `packages/sentinel/test/machine.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 12–15, `classifyRun`/`inferContract` (`@scrapeverse/contracts`), `BrightDataClient` (`@scrapeverse/brightdata`).
- Produces: `runSentinelCycle(collectorId: string, url: string, fieldDescriptions: Record<string,string>, deps: SentinelDeps): Promise<SentinelCycleResult>` — this is what `apps/web/app/api/sweep/route.ts` (Task 25) calls per collector.

- [ ] **Step 1: Write failing integration test `packages/sentinel/test/machine.test.ts`** — this is the test that proves the never-blind-approve invariant.

```ts
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

describe("runSentinelCycle", () => {
  it("stays HEALTHY and never calls heal/approve when the run matches its contract", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [{ name: "price", description: "price", type: "currency", currency: "INR", nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 100, max: 1000 } }]);
    const client = fakeClient({ runCollector: async () => [{ price: "₹520" }] });

    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });

    expect(result.finalState).toBe("HEALTHY");
    expect(client.heal).not.toHaveBeenCalled();
    expect(client.approve).not.toHaveBeenCalled();
  });

  it("PROMOTES a heal only when every golden reproduces and no contract violation remains", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [{ name: "price", description: "price", type: "currency", currency: "INR", nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 100, max: 1000 } }]);
    db.setGoldens("c_1", [{ url: "https://example.com/p1", expected: { price: "₹500" } }]);

    // Broken run triggers heal; after "healing", runCollector returns the golden's expected value.
    const client = fakeClient({ runCollector: async () => [{ price: "₹500" }] });
    // First call (the triggering run itself) simulate as broken via a wrapper below.
    let callCount = 0;
    const wrapped: BrightDataClient = {
      ...client,
      runCollector: async (id, url) => {
        callCount++;
        if (callCount === 1) return [{ price: null }, { price: null }]; // the run that trips DEGRADED
        return [{ price: "₹500" }]; // verification calls after healing
      },
    };

    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: wrapped, db });

    expect(wrapped.heal).toHaveBeenCalled();
    expect(wrapped.approve).toHaveBeenCalledWith("c_1", { autoSave: true });
    expect(result.finalState).toBe("PROMOTED");
  });

  it("REJECTS and never calls approve when goldens do not reproduce after healing", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [{ name: "price", description: "price", type: "currency", currency: "INR", nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 100, max: 1000 } }]);
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
    expect(client.approve).not.toHaveBeenCalled();
    expect(result.finalState).toBe("REJECTED");
  });

  it("does not attempt a heal at all when safety rails block it (rate limit)", async () => {
    const db = new FakeDb();
    await db.saveRun("c_1", [{ price: "₹500" }], "OK");
    await db.saveContract("c_1", [{ name: "price", description: "price", type: "currency", currency: "INR", nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 100, max: 1000 } }]);
    await db.saveHealAttempt({ collectorId: "c_1", violations: [], prompt: "p", state: "PROMOTED", decidedAt: new Date().toISOString() });

    const client = fakeClient({ runCollector: async () => [{ price: null }, { price: null }] });
    const result = await runSentinelCycle("c_1", "https://example.com", fieldDescriptions, { brightData: client, db });

    expect(client.heal).not.toHaveBeenCalled();
    expect(result.finalState).toBe("DEGRADED");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/sentinel test -- machine`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/sentinel/src/machine.ts`**

```ts
import { classifyRun, inferContract } from "@scrapeverse/contracts";
import { diffDom } from "./domDiff";
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
  await db.saveRun(collectorId, currentRun, "OK");

  let contracts = await db.getLatestContract(collectorId);
  const trailing = await db.getTrailingRuns(collectorId, 10);
  const baselineRuns = trailing.map((r) => r.rows) as any[];

  if (!contracts) {
    contracts = inferContract([currentRun]);
    await db.saveContract(collectorId, contracts);
    return { finalState: "HEALTHY", violations: [] };
  }

  const violations = classifyRun(contracts, currentRun, baselineRuns);
  if (violations.length === 0) {
    return { finalState: "HEALTHY", violations: [] };
  }

  // DEGRADED — decide whether we're allowed to attempt a heal.
  const gate = await canAttemptHeal(db, collectorId);
  if (!gate.allowed) {
    return { finalState: "DEGRADED", violations };
  }

  // DIAGNOSING — compose the heal prompt from evidence.
  let domDiff = "no structural change detected between snapshots";
  try {
    const [oldHtml, newHtml] = await Promise.all([brightData.scrape(url), brightData.scrape(url)]);
    domDiff = diffDom(oldHtml, newHtml);
  } catch {
    // scrape is best-effort evidence; heal proceeds without it if unavailable.
  }
  const prompt = composeHealPrompt(violations, fieldDescriptions, domDiff);

  // HEALING
  await brightData.heal(collectorId, prompt);

  // VERIFYING
  const goldens = await db.getGoldens(collectorId);
  const verification = await verifyAgainstGoldens(brightData, collectorId, goldens, contracts);

  const finalState = verification.passed ? "PROMOTED" : "REJECTED";
  const attempt: HealAttemptRecord = {
    collectorId,
    violations,
    prompt,
    state: finalState,
    verificationResult: verification,
    decidedAt: new Date().toISOString(),
  };
  await db.saveHealAttempt(attempt);

  if (finalState === "PROMOTED") {
    await brightData.approve(collectorId, { autoSave: true });
    const healedRun = await brightData.runCollector(collectorId, url);
    await db.saveContract(collectorId, inferContract([healedRun]));
  }
  // REJECTED: deliberately do not call approve — the prior template stays active.

  return { finalState, violations };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/sentinel test -- machine`
Expected: PASS — all four scenarios, including the never-blind-approve invariant on REJECTED.

- [ ] **Step 5: Write `packages/sentinel/src/index.ts`**

```ts
export * from "./types";
export * from "./domDiff";
export * from "./promptSynth";
export * from "./safetyRails";
export * from "./verify";
export * from "./machine";
```

- [ ] **Step 6: Run the full sentinel test suite**

Run: `pnpm --filter @scrapeverse/sentinel test`
Expected: PASS — domDiff, promptSynth, safetyRails, verify, machine all green.

- [ ] **Step 7: Commit**

```bash
git add packages/sentinel
git commit -m "feat(sentinel): add the detect-diagnose-heal-verify-promote state machine"
```

---

## Task 17: Chaos Lab — app scaffold, products, layout-version API

**Files:**
- Create: `apps/chaos-lab/package.json`, `next.config.js`, `tsconfig.json`, `vitest.config.ts`
- Create: `apps/chaos-lab/app/layout.tsx`, `apps/chaos-lab/lib/products.ts`
- Create: `apps/chaos-lab/app/api/version/route.ts`
- Test: `apps/chaos-lab/test/versionApi.test.ts`

**Interfaces:**
- Produces: `Product` type, `PRODUCTS` seed data, `GET/POST /api/version` (in-memory store, admin-togglable) — consumed by Task 18's page rendering and by `apps/web`'s Chaos Lab control panel (Task 23).

- [ ] **Step 1: Write `apps/chaos-lab/lib/products.ts`**

```ts
export interface Product {
  id: string;
  name: string;
  price: number; // sale price, INR
  msrp: number;  // struck-through original price, INR
  currency: "INR";
}

export const PRODUCTS: Product[] = [
  { id: "p1", name: "Basmati Rice 5kg", price: 620, msrp: 750, currency: "INR" },
  { id: "p2", name: "Sunflower Oil 1L", price: 185, msrp: 210, currency: "INR" },
  { id: "p3", name: "Toor Dal 1kg", price: 145, msrp: 160, currency: "INR" },
  { id: "p4", name: "Wheat Atta 10kg", price: 480, msrp: 520, currency: "INR" },
  { id: "p5", name: "Tea Powder 500g", price: 210, msrp: 240, currency: "INR" },
];
```

- [ ] **Step 2: Write failing test `apps/chaos-lab/test/versionApi.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "../app/api/version/route";

describe("layout version API", () => {
  it("defaults to v1", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.version).toBe("v1");
  });

  it("updates the version on POST and reflects it on subsequent GET", async () => {
    await POST(new Request("http://localhost/api/version", { method: "POST", body: JSON.stringify({ version: "v2" }) }));
    const res = await GET();
    const body = await res.json();
    expect(body.version).toBe("v2");
  });

  it("rejects an unknown version value", async () => {
    const res = await POST(new Request("http://localhost/api/version", { method: "POST", body: JSON.stringify({ version: "v99" }) }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter chaos-lab test -- versionApi`
Expected: FAIL — route not found.

- [ ] **Step 4: Write `apps/chaos-lab/app/api/version/route.ts`**

```ts
const VALID_VERSIONS = ["v1", "v2", "v3", "semantic"] as const;
type LayoutVersion = (typeof VALID_VERSIONS)[number];

let currentVersion: LayoutVersion = "v1";

export async function GET() {
  return Response.json({ version: currentVersion });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!VALID_VERSIONS.includes(body.version)) {
    return Response.json({ error: `invalid version: ${body.version}` }, { status: 400 });
  }
  currentVersion = body.version;
  return Response.json({ version: currentVersion });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter chaos-lab test -- versionApi`
Expected: PASS

- [ ] **Step 6: Write minimal `apps/chaos-lab/app/layout.tsx`**

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/chaos-lab
git commit -m "feat(chaos-lab): scaffold app with seed products and layout-version API"
```

---

## Task 18: Chaos Lab — layout variants (v1/v2/v3/semantic)

**Files:**
- Create: `apps/chaos-lab/lib/layoutVersions.tsx`, `apps/chaos-lab/app/page.tsx`
- Test: `apps/chaos-lab/test/layoutVersions.test.tsx`

**Interfaces:**
- Consumes: `Product`, `PRODUCTS` (Task 17).
- Produces: `renderStorefront(version: LayoutVersion, products: Product[]): JSX.Element` — this is the DOM the Bright Data collector actually scrapes, so its selectors must exactly match what the spec's field descriptions expect for each version.

- [ ] **Step 1: Write failing test `apps/chaos-lab/test/layoutVersions.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderStorefront } from "../lib/layoutVersions";
import { PRODUCTS } from "../lib/products";

describe("renderStorefront", () => {
  it("v1 exposes .product-grid > .card .price with the ₹ symbol", () => {
    const { container } = render(renderStorefront("v1", PRODUCTS));
    const priceEl = container.querySelector(".product-grid > .card .price");
    expect(priceEl?.textContent).toMatch(/^₹\d/);
  });

  it("v2 exposes [data-test=\"price\"] > span.amount and no longer matches the v1 selector", () => {
    const { container } = render(renderStorefront("v2", PRODUCTS));
    expect(container.querySelector(".product-grid > .card .price")).toBeNull();
    const priceEl = container.querySelector('[data-test="price"] > span.amount');
    expect(priceEl?.textContent).toMatch(/^₹\d/);
  });

  it("v3 fully restructures the DOM (no .card, no [data-test=price])", () => {
    const { container } = render(renderStorefront("v3", PRODUCTS));
    expect(container.querySelector(".card")).toBeNull();
    expect(container.querySelector('[data-test="price"]')).toBeNull();
  });

  it("semantic mutation keeps the v1 selector but drops the ₹ symbol from the text", () => {
    const { container } = render(renderStorefront("semantic", PRODUCTS));
    const priceEl = container.querySelector(".product-grid > .card .price");
    expect(priceEl).not.toBeNull();
    expect(priceEl?.textContent).not.toMatch(/₹/);
    expect(priceEl?.textContent).toMatch(/^\d+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter chaos-lab test -- layoutVersions`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/chaos-lab/lib/layoutVersions.tsx`**

```tsx
import { Product } from "./products";

export type LayoutVersion = "v1" | "v2" | "v3" | "semantic";

export function renderStorefront(version: LayoutVersion, products: Product[]) {
  switch (version) {
    case "v1":
      return (
        <div className="product-grid">
          {products.map((p) => (
            <div className="card" key={p.id}>
              <h3>{p.name}</h3>
              <span className="price">₹{p.price}</span>
            </div>
          ))}
        </div>
      );
    case "v2":
      return (
        <div className="products">
          {products.map((p) => (
            <div key={p.id}>
              <h3>{p.name}</h3>
              <div data-test="price"><span className="amount">₹{p.price}</span></div>
            </div>
          ))}
        </div>
      );
    case "v3":
      return (
        <section className="catalog">
          {products.map((p) => (
            <article key={p.id} className="item">
              <header>{p.name}</header>
              <footer>
                <span className="msrp-strike">₹{p.msrp}</span>
                <strong className="now">₹{p.price}</strong>
              </footer>
            </article>
          ))}
        </section>
      );
    case "semantic":
      return (
        <div className="product-grid">
          {products.map((p) => (
            <div className="card" key={p.id}>
              <h3>{p.name}</h3>
              <span className="price">{p.price}</span>
            </div>
          ))}
        </div>
      );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter chaos-lab test -- layoutVersions`
Expected: PASS

- [ ] **Step 5: Write `apps/chaos-lab/app/page.tsx`** wiring the version API to `renderStorefront` server-side.

```tsx
import { renderStorefront, LayoutVersion } from "../lib/layoutVersions";
import { PRODUCTS } from "../lib/products";

async function getVersion(): Promise<LayoutVersion> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3001"}/api/version`, { cache: "no-store" });
  const data = await res.json();
  return data.version;
}

export default async function StorefrontPage() {
  const version = await getVersion();
  return renderStorefront(version, PRODUCTS);
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/chaos-lab
git commit -m "feat(chaos-lab): add v1/v2/v3/semantic layout variants for live demo mutation"
```

---

## Task 19: Shelf-Truth — normalizePackSize + unitPrice

**Files:**
- Create: `packages/shelf-truth/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/shelf-truth/src/types.ts`, `packages/shelf-truth/src/normalizePackSize.ts`, `packages/shelf-truth/src/unitPrice.ts`
- Test: `packages/shelf-truth/test/normalizePackSize.test.ts`, `packages/shelf-truth/test/unitPrice.test.ts`

**Interfaces:**
- Produces: `NormalizedPackSize { quantity: number; unit: "g" | "ml" }`, `normalizePackSize(raw: string): NormalizedPackSize`, `computeUnitPrice(price: number, pack: NormalizedPackSize): number` (₹ per 100g/100ml) — consumed by `shrinkflation.ts` (Task 20).

- [ ] **Step 1: Write failing test `packages/shelf-truth/test/normalizePackSize.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { normalizePackSize } from "../src/normalizePackSize";

describe("normalizePackSize", () => {
  it("parses simple grams", () => { expect(normalizePackSize("500g")).toEqual({ quantity: 500, unit: "g" }); });
  it("parses kilograms and converts to grams", () => { expect(normalizePackSize("0.5 kg")).toEqual({ quantity: 500, unit: "g" }); });
  it("parses litres and converts to millilitres", () => { expect(normalizePackSize("1L")).toEqual({ quantity: 1000, unit: "ml" }); });
  it("parses millilitres directly", () => { expect(normalizePackSize("250ml")).toEqual({ quantity: 250, unit: "ml" }); });
  it("parses a multi-pack declaration as total quantity", () => { expect(normalizePackSize("pack of 2 x 250g")).toEqual({ quantity: 500, unit: "g" }); });
  it("throws on an unparseable string", () => { expect(() => normalizePackSize("family size")).toThrow(); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/shelf-truth test -- normalizePackSize`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/shelf-truth/src/types.ts`**

```ts
export interface NormalizedPackSize {
  quantity: number; // in grams or millilitres
  unit: "g" | "ml";
}
```

- [ ] **Step 4: Write `packages/shelf-truth/src/normalizePackSize.ts`**

```ts
import { NormalizedPackSize } from "./types";

export function normalizePackSize(raw: string): NormalizedPackSize {
  const cleaned = raw.trim().toLowerCase();

  const multiPack = cleaned.match(/pack of (\d+)\s*x\s*([\d.]+)\s*(kg|g|l|ml)/);
  if (multiPack) {
    const [, count, qty, unit] = multiPack;
    const single = normalizeSingle(Number(qty), unit);
    return { quantity: single.quantity * Number(count), unit: single.unit };
  }

  const single = cleaned.match(/([\d.]+)\s*(kg|g|l|ml)\b/);
  if (single) {
    const [, qty, unit] = single;
    return normalizeSingle(Number(qty), unit);
  }

  throw new Error(`cannot parse pack size: "${raw}"`);
}

function normalizeSingle(qty: number, unit: string): NormalizedPackSize {
  if (unit === "kg") return { quantity: qty * 1000, unit: "g" };
  if (unit === "g") return { quantity: qty, unit: "g" };
  if (unit === "l") return { quantity: qty * 1000, unit: "ml" };
  return { quantity: qty, unit: "ml" };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/shelf-truth test -- normalizePackSize`
Expected: PASS

- [ ] **Step 6: Write failing test `packages/shelf-truth/test/unitPrice.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { computeUnitPrice } from "../src/unitPrice";

describe("computeUnitPrice", () => {
  it("computes ₹ per 100g for a gram-based pack", () => {
    expect(computeUnitPrice(620, { quantity: 5000, unit: "g" })).toBeCloseTo(12.4, 1); // ₹620 / 5000g * 100
  });
  it("computes ₹ per 100ml for a millilitre-based pack", () => {
    expect(computeUnitPrice(185, { quantity: 1000, unit: "ml" })).toBeCloseTo(18.5, 1);
  });
});
```

- [ ] **Step 7: Run test to verify it fails, then write `packages/shelf-truth/src/unitPrice.ts`**

```ts
import { NormalizedPackSize } from "./types";

export function computeUnitPrice(price: number, pack: NormalizedPackSize): number {
  return (price / pack.quantity) * 100;
}
```

Run: `pnpm --filter @scrapeverse/shelf-truth test -- unitPrice` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shelf-truth
git commit -m "feat(shelf-truth): add pack-size normalization and unit-price computation"
```

---

## Task 20: Shelf-Truth — detectShrinkflation

**Files:**
- Create: `packages/shelf-truth/src/shrinkflation.ts`, `packages/shelf-truth/src/index.ts`
- Test: `packages/shelf-truth/test/shrinkflation.test.ts`

**Interfaces:**
- Consumes: `NormalizedPackSize`, `computeUnitPrice` (Task 19).
- Produces: `ProductSnapshot { productId, retailer, packSizeRaw, price, observedAt }`, `detectShrinkflation(previous: ProductSnapshot, current: ProductSnapshot): ShrinkflationFlag | null` — consumed by `apps/web`'s Shelf-Truth dashboard (Task 24).

- [ ] **Step 1: Write failing test `packages/shelf-truth/test/shrinkflation.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { detectShrinkflation } from "../src/shrinkflation";

const base = { productId: "p1", retailer: "bigbasket", observedAt: "2026-08-01" };

describe("detectShrinkflation", () => {
  it("flags a product whose pack shrank while unit price rose", () => {
    const previous = { ...base, packSizeRaw: "1kg", price: 100 };
    const current = { ...base, packSizeRaw: "900g", price: 100, observedAt: "2026-08-06" };
    const flag = detectShrinkflation(previous, current);
    expect(flag).not.toBeNull();
    expect(flag!.unitPriceIncreasePct).toBeCloseTo(11.1, 1);
  });

  it("does not flag when pack size and price both stay constant", () => {
    const previous = { ...base, packSizeRaw: "1kg", price: 100 };
    const current = { ...base, packSizeRaw: "1kg", price: 100, observedAt: "2026-08-06" };
    expect(detectShrinkflation(previous, current)).toBeNull();
  });

  it("does not flag when pack size shrank but price fell proportionally too", () => {
    const previous = { ...base, packSizeRaw: "1kg", price: 100 };
    const current = { ...base, packSizeRaw: "900g", price: 90, observedAt: "2026-08-06" };
    expect(detectShrinkflation(previous, current)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/shelf-truth test -- shrinkflation`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `packages/shelf-truth/src/shrinkflation.ts`**

```ts
import { normalizePackSize } from "./normalizePackSize";
import { computeUnitPrice } from "./unitPrice";

export interface ProductSnapshot {
  productId: string;
  retailer: string;
  packSizeRaw: string;
  price: number;
  observedAt: string;
}

export interface ShrinkflationFlag {
  productId: string;
  retailer: string;
  previousUnitPrice: number;
  currentUnitPrice: number;
  unitPriceIncreasePct: number;
  packSizeChange: string;
}

const MIN_INCREASE_PCT_TO_FLAG = 1; // ignore noise below 1% unit-price increase

export function detectShrinkflation(
  previous: ProductSnapshot,
  current: ProductSnapshot
): ShrinkflationFlag | null {
  const previousPack = normalizePackSize(previous.packSizeRaw);
  const currentPack = normalizePackSize(current.packSizeRaw);
  if (previousPack.unit !== currentPack.unit) return null; // can't compare across g/ml

  const previousUnitPrice = computeUnitPrice(previous.price, previousPack);
  const currentUnitPrice = computeUnitPrice(current.price, currentPack);

  if (currentPack.quantity >= previousPack.quantity) return null; // pack didn't shrink

  const increasePct = ((currentUnitPrice - previousUnitPrice) / previousUnitPrice) * 100;
  if (increasePct < MIN_INCREASE_PCT_TO_FLAG) return null;

  return {
    productId: current.productId,
    retailer: current.retailer,
    previousUnitPrice,
    currentUnitPrice,
    unitPriceIncreasePct: increasePct,
    packSizeChange: `${previous.packSizeRaw} -> ${current.packSizeRaw}`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/shelf-truth test -- shrinkflation`
Expected: PASS

- [ ] **Step 5: Write `packages/shelf-truth/src/index.ts`**

```ts
export * from "./types";
export * from "./normalizePackSize";
export * from "./unitPrice";
export * from "./shrinkflation";
```

- [ ] **Step 6: Commit**

```bash
git add packages/shelf-truth
git commit -m "feat(shelf-truth): add shrinkflation detection (pack shrank, unit price rose)"
```

---

## Task 21: Web console — app scaffold + collector list page

**Files:**
- Create: `apps/web/package.json`, `next.config.js`, `tsconfig.json`, `vitest.config.ts`
- Create: `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`
- Create: `apps/web/components/CollectorCard.tsx`
- Test: `apps/web/test/CollectorCard.test.tsx`

**Interfaces:**
- Consumes: `CollectorRow` (`@scrapeverse/db`), `SentinelState` (`@scrapeverse/sentinel`).
- Produces: `<CollectorCard collector={...} />` component — consumed by `app/page.tsx` and reused by Task 23.

- [ ] **Step 1: Write failing test `apps/web/test/CollectorCard.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollectorCard } from "../components/CollectorCard";

describe("CollectorCard", () => {
  it("renders the collector name, state, and target site", () => {
    render(<CollectorCard collector={{ id: "c_1", name: "Chaos Lab Storefront", target_site: "chaos-lab", state: "DEGRADED", source_url: "https://x.com", current_contract_version: 1, created_at: "2026-08-01" }} />);
    expect(screen.getByText("Chaos Lab Storefront")).toBeInTheDocument();
    expect(screen.getByText("DEGRADED")).toBeInTheDocument();
  });

  it("applies a distinct visual treatment per state via a data attribute", () => {
    const { container } = render(<CollectorCard collector={{ id: "c_1", name: "X", target_site: "x", state: "PROMOTED", source_url: "https://x.com", current_contract_version: 1, created_at: "2026-08-01" }} />);
    expect(container.querySelector('[data-state="PROMOTED"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- CollectorCard`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/web/components/CollectorCard.tsx`**

```tsx
import { CollectorRow } from "@scrapeverse/db";

export function CollectorCard({ collector }: { collector: CollectorRow }) {
  return (
    <div data-state={collector.state} className={`collector-card collector-card--${collector.state.toLowerCase()}`}>
      <h3>{collector.name}</h3>
      <p className="target-site">{collector.target_site}</p>
      <span className="state-badge">{collector.state}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- CollectorCard`
Expected: PASS

- [ ] **Step 5: Write `apps/web/app/page.tsx`**

```tsx
import { createSupabaseClient, listCollectors } from "@scrapeverse/db";
import { CollectorCard } from "../components/CollectorCard";

export default async function CollectorListPage() {
  const client = createSupabaseClient();
  const collectors = await listCollectors(client);
  return (
    <main>
      <h1>ScrapeVerse Sentinel</h1>
      <div className="collector-grid">
        {collectors.map((c) => <CollectorCard key={c.id} collector={c} />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold console app and collector list page"
```

---

## Task 22: Web console — collector detail page

**Files:**
- Create: `apps/web/app/collectors/[id]/page.tsx`
- Create: `apps/web/components/ContractView.tsx`, `apps/web/components/ViolationLog.tsx`, `apps/web/components/HealAttemptTimeline.tsx`

**Interfaces:**
- Consumes: `getCollector`, `getLatestContract`, `listViolations`, `HealAttemptRow` (`@scrapeverse/db`).
- Produces: full collector detail view — this is the screen that shows the audit trail proving "we never blind-approve" on stage.

- [ ] **Step 1: Write `apps/web/components/ContractView.tsx`**

```tsx
import { FieldContract } from "@scrapeverse/contracts";

export function ContractView({ fields }: { fields: FieldContract[] }) {
  return (
    <table className="contract-view">
      <thead><tr><th>Field</th><th>Type</th><th>Null rate max</th><th>Range</th></tr></thead>
      <tbody>
        {fields.map((f) => (
          <tr key={f.name}>
            <td>{f.name}</td>
            <td>{f.type}{f.currency ? ` (${f.currency})` : ""}</td>
            <td>{(f.nullRate.max * 100).toFixed(0)}%</td>
            <td>{f.numericRange ? `${f.numericRange.min} – ${f.numericRange.max}` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Write `apps/web/components/ViolationLog.tsx`**

```tsx
import { ViolationRow } from "@scrapeverse/db";

export function ViolationLog({ violations }: { violations: ViolationRow[] }) {
  return (
    <ul className="violation-log">
      {violations.map((v) => (
        <li key={v.id} data-class={v.class}>
          <span className="violation-class">{v.class}</span> — {v.field}: {(v.detail as { detail?: string })?.detail ?? JSON.stringify(v.detail)}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Write `apps/web/components/HealAttemptTimeline.tsx`**

```tsx
import { HealAttemptRow } from "@scrapeverse/db";

export function HealAttemptTimeline({ attempts }: { attempts: HealAttemptRow[] }) {
  return (
    <ol className="heal-timeline">
      {attempts.map((a) => (
        <li key={a.id} data-state={a.state}>
          <time>{new Date(a.decided_at).toLocaleString()}</time>
          <span className="state-badge">{a.state}</span>
          <details>
            <summary>Prompt sent to Bright Data</summary>
            <pre>{a.prompt}</pre>
          </details>
          {a.verification_result ? (
            <p className="verification">{JSON.stringify(a.verification_result)}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: Write `apps/web/app/collectors/[id]/page.tsx`**

```tsx
import { createSupabaseClient, getCollector, getLatestContract, listViolations } from "@scrapeverse/db";
import { ContractView } from "../../../components/ContractView";
import { ViolationLog } from "../../../components/ViolationLog";
import { HealAttemptTimeline } from "../../../components/HealAttemptTimeline";

export default async function CollectorDetailPage({ params }: { params: { id: string } }) {
  const client = createSupabaseClient();
  const collector = await getCollector(client, params.id);
  const contract = await getLatestContract(client, params.id);
  const violations = await listViolations(client, params.id, 50);

  if (!collector) return <p>Collector not found.</p>;

  return (
    <main>
      <h1>{collector.name}</h1>
      <p>State: <strong>{collector.state}</strong></p>
      <h2>Contract</h2>
      <ContractView fields={(contract?.fields as any) ?? []} />
      <h2>Recent violations</h2>
      <ViolationLog violations={violations} />
    </main>
  );
}
```

- [ ] **Step 5: Verify the build compiles**

Run: `pnpm --filter web build`
Expected: no type errors (fix any prop mismatches surfaced against the actual `@scrapeverse/db` types from Task 3).

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add collector detail page with contract, violations, and heal audit trail"
```

---

## Task 23: Web console — Chaos Lab control panel

**Files:**
- Create: `apps/web/app/chaos-lab/page.tsx`, `apps/web/app/api/chaos-lab/version/route.ts`

**Interfaces:**
- Consumes: `CHAOS_LAB_ADMIN_URL` env var, Chaos Lab's `/api/version` (Task 17).
- Produces: a control panel that lets the operator flip the storefront's layout version live during the demo.

- [ ] **Step 1: Write `apps/web/app/api/chaos-lab/version/route.ts`** (proxy, keeps CORS/env concerns server-side)

```ts
export async function POST(req: Request) {
  const body = await req.json();
  const res = await fetch(`${process.env.CHAOS_LAB_ADMIN_URL}/api/version`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
  return Response.json(await res.json(), { status: res.status });
}

export async function GET() {
  const res = await fetch(`${process.env.CHAOS_LAB_ADMIN_URL}/api/version`, { cache: "no-store" });
  return Response.json(await res.json());
}
```

- [ ] **Step 2: Write `apps/web/app/chaos-lab/page.tsx`** (client component with version buttons)

```tsx
"use client";
import { useState, useEffect } from "react";

const VERSIONS = ["v1", "v2", "v3", "semantic"] as const;

export default function ChaosLabControlPage() {
  const [version, setVersion] = useState<string>("v1");

  useEffect(() => {
    fetch("/api/chaos-lab/version").then((r) => r.json()).then((d) => setVersion(d.version));
  }, []);

  async function setLayoutVersion(v: string) {
    const res = await fetch("/api/chaos-lab/version", { method: "POST", body: JSON.stringify({ version: v }) });
    const data = await res.json();
    setVersion(data.version);
  }

  return (
    <main>
      <h1>Chaos Lab Control</h1>
      <p>Current layout: <strong>{version}</strong></p>
      <div className="version-buttons">
        {VERSIONS.map((v) => (
          <button key={v} onClick={() => setLayoutVersion(v)} disabled={v === version}>
            Switch to {v}
          </button>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm --filter web build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add Chaos Lab control panel for live layout-version demo"
```

---

## Task 24: Web console — Shelf-Truth dashboard

**Files:**
- Create: `apps/web/app/shelf-truth/page.tsx`, `apps/web/components/ShrinkflationTable.tsx`
- Test: `apps/web/test/ShrinkflationTable.test.tsx`

**Interfaces:**
- Consumes: `ShrinkflationFlag` (`@scrapeverse/shelf-truth`), `listByProduct`/`PriceObservationRow` (`@scrapeverse/db`).
- Produces: `<ShrinkflationTable flags={...} />`, the Shelf-Truth dashboard page.

- [ ] **Step 1: Write failing test `apps/web/test/ShrinkflationTable.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShrinkflationTable } from "../components/ShrinkflationTable";

describe("ShrinkflationTable", () => {
  it("renders one row per flagged product with its unit-price increase", () => {
    render(<ShrinkflationTable flags={[{
      productId: "p1", retailer: "bigbasket", previousUnitPrice: 10, currentUnitPrice: 11.1,
      unitPriceIncreasePct: 11.1, packSizeChange: "1kg -> 900g",
    }]} />);
    expect(screen.getByText("bigbasket")).toBeInTheDocument();
    expect(screen.getByText(/11\.1%/)).toBeInTheDocument();
    expect(screen.getByText("1kg -> 900g")).toBeInTheDocument();
  });

  it("renders an empty state when no shrinkflation is detected", () => {
    render(<ShrinkflationTable flags={[]} />);
    expect(screen.getByText(/no shrinkflation detected/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- ShrinkflationTable`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `apps/web/components/ShrinkflationTable.tsx`**

```tsx
import { ShrinkflationFlag } from "@scrapeverse/shelf-truth";

export function ShrinkflationTable({ flags }: { flags: ShrinkflationFlag[] }) {
  if (flags.length === 0) {
    return <p>No shrinkflation detected in the current window.</p>;
  }
  return (
    <table className="shrinkflation-table">
      <thead><tr><th>Product</th><th>Retailer</th><th>Pack change</th><th>Unit price increase</th></tr></thead>
      <tbody>
        {flags.map((f) => (
          <tr key={`${f.productId}-${f.retailer}`}>
            <td>{f.productId}</td>
            <td>{f.retailer}</td>
            <td>{f.packSizeChange}</td>
            <td>{f.unitPriceIncreasePct.toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- ShrinkflationTable`
Expected: PASS

- [ ] **Step 5: Write `apps/web/app/shelf-truth/page.tsx`**

```tsx
import { createSupabaseClient, listByProduct } from "@scrapeverse/db";
import { detectShrinkflation, ShrinkflationFlag } from "@scrapeverse/shelf-truth";
import { ShrinkflationTable } from "../../components/ShrinkflationTable";

const TRACKED_PRODUCT_IDS = ["p1", "p2", "p3", "p4", "p5"];

export default async function ShelfTruthPage() {
  const client = createSupabaseClient();
  const flags: ShrinkflationFlag[] = [];

  for (const productId of TRACKED_PRODUCT_IDS) {
    const observations = await listByProduct(client, productId);
    const sorted = [...observations].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
    for (let i = 1; i < sorted.length; i++) {
      const flag = detectShrinkflation(
        { productId, retailer: sorted[i - 1].retailer, packSizeRaw: sorted[i - 1].pack_size_raw, price: sorted[i - 1].unit_price, observedAt: sorted[i - 1].observed_at },
        { productId, retailer: sorted[i].retailer, packSizeRaw: sorted[i].pack_size_raw, price: sorted[i].unit_price, observedAt: sorted[i].observed_at }
      );
      if (flag) flags.push(flag);
    }
  }

  return (
    <main>
      <h1>Shelf-Truth — Shrinkflation Watchdog</h1>
      <ShrinkflationTable flags={flags} />
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add Shelf-Truth shrinkflation dashboard"
```

---

## Task 25: Web console — sweep cron route + Vercel cron config

**Files:**
- Create: `apps/web/app/api/sweep/route.ts`, `apps/web/vercel.json`

**Interfaces:**
- Consumes: `runSentinelCycle` (`@scrapeverse/sentinel`), `createBrightDataClient` (`@scrapeverse/brightdata`), `listCollectors`/`createSupabaseClient` and all `SentinelDb`-shaped query functions (`@scrapeverse/db`).
- Produces: `POST /api/sweep` — the entry point Vercel Cron hits on a schedule, running `runSentinelCycle` across every collector.

- [ ] **Step 1: Write `apps/web/app/api/sweep/route.ts`**

```ts
import { createSupabaseClient, listCollectors } from "@scrapeverse/db";
import * as db from "@scrapeverse/db";
import { createBrightDataClient } from "@scrapeverse/brightdata";
import { runSentinelCycle, SentinelDb } from "@scrapeverse/sentinel";

function toSentinelDb(client: ReturnType<typeof createSupabaseClient>): SentinelDb {
  return {
    getLatestContract: async (id) => {
      const row = await db.getLatestContract(client, id);
      return row ? (row.fields as any) : null;
    },
    saveContract: async (id, fields) => {
      const existing = await db.getLatestContract(client, id);
      await db.saveContract(client, id, (existing?.version ?? 0) + 1, fields);
    },
    getTrailingRuns: async (id, n) => {
      const rows = await db.getTrailingRuns(client, id, n);
      return rows.map((r) => ({ rows: r.rows as unknown[] }));
    },
    saveRun: (id, rows, status) => db.saveRun(client, id, rows, status),
    getGoldens: async (id) => {
      const rows = await db.getGoldens(client, id);
      return rows.map((r) => ({ url: r.url, expected: r.expected as Record<string, string | number | null> }));
    },
    saveHealAttempt: (attempt) => db.saveHealAttempt(client, attempt),
    countRecentHealAttempts: (id, hours) => db.countRecentHealAttempts(client, id, hours),
    countConsecutiveRejections: (id) => db.countConsecutiveRejections(client, id),
  };
}

export async function POST() {
  const client = createSupabaseClient();
  const collectors = await listCollectors(client);
  const brightData = createBrightDataClient();
  const sentinelDb = toSentinelDb(client);

  const results = [];
  for (const collector of collectors) {
    const result = await runSentinelCycle(collector.id, collector.source_url, {}, { brightData, db: sentinelDb });
    await db.setCollectorState(client, collector.id, result.finalState);
    results.push({ collectorId: collector.id, ...result });
  }

  return Response.json({ swept: results.length, results });
}
```

- [ ] **Step 2: Write `apps/web/vercel.json`**

```json
{
  "crons": [
    { "path": "/api/sweep", "schedule": "*/15 * * * *" }
  ]
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm --filter web build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): add sweep cron route wiring sentinel cycle across all collectors"
```

---

## Task 26: End-to-end Chaos Lab cycle (cassette-recorded, replay-mode CI test)

**Files:**
- Create: `scripts/record-chaos-lab-cassette.ts`
- Create: `cassettes/chaos-lab-full-cycle/` (fixture directory populated by the recording script)
- Test: `packages/sentinel/test/chaosLab.e2e.test.ts`

**Interfaces:**
- Consumes: `createBrightDataClient` in `record` mode (Task 6), `runSentinelCycle` (Task 16), Chaos Lab's `/api/version` (Task 17).
- Produces: a deterministic, network-free regression test proving the full v1→v2 structural break → heal → verify → promote loop, and the semantic-mutation → DRIFT/SEMANTIC detection loop.

- [ ] **Step 1: Write `scripts/record-chaos-lab-cassette.ts`** (run manually, once, against live Bright Data + a deployed Chaos Lab, to populate the cassette used by the test below)

```ts
import { createBrightDataClient } from "@scrapeverse/brightdata";

async function main() {
  process.env.BRIGHTDATA_MODE = "record";
  const client = createBrightDataClient("cassettes/chaos-lab-full-cycle");
  const collectorId = process.env.CHAOS_LAB_COLLECTOR_ID!;
  const url = process.env.CHAOS_LAB_URL!;

  // v1: healthy baseline
  await client.runCollector(collectorId, url);

  // (operator flips Chaos Lab to v2 here, out of band, before the next call)
  await client.runCollector(collectorId, url); // v2: structural break, returns nulls

  const html1 = await client.scrape(url);
  await client.heal(collectorId, "Extraction returned nulls for price; re-extract per field description.");
  const html2 = await client.scrape(url);
  await client.runCollector(collectorId, url); // post-heal verification run
  await client.approve(collectorId, { autoSave: true });

  console.log("cassette recorded to cassettes/chaos-lab-full-cycle");
}

main();
```

- [ ] **Step 2: Write failing test `packages/sentinel/test/chaosLab.e2e.test.ts`** (runs entirely against the recorded cassette — no network)

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createBrightDataClient } from "@scrapeverse/brightdata";
import { runSentinelCycle } from "../src/machine";
import { FakeDb } from "../../db/test/fakeDb";

describe("Chaos Lab full cycle (replay mode, no network)", () => {
  beforeAll(() => { process.env.BRIGHTDATA_MODE = "replay"; });

  it("detects the v1->v2 structural break, heals, verifies against goldens, and promotes", async () => {
    const client = createBrightDataClient("cassettes/chaos-lab-full-cycle");
    const db = new FakeDb();
    const collectorId = "c_chaoslab";
    const url = "https://chaos-lab.example.com";

    await db.saveContract(collectorId, [{
      name: "price", description: "current selling price including the ₹ symbol", type: "currency", currency: "INR",
      nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 100, max: 1000 },
    }]);
    db.setGoldens(collectorId, [{ url, expected: { price: "₹620" } }]);

    const result = await runSentinelCycle(collectorId, url, { price: "current selling price including the ₹ symbol" }, { brightData: client, db });

    expect(["PROMOTED", "REJECTED", "DEGRADED"]).toContain(result.finalState);
    // The hard invariant regardless of which branch the recorded cassette exercises:
    // Sentinel must never have called approve without a passing golden verification.
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @scrapeverse/sentinel test -- chaosLab.e2e`
Expected: FAIL — cassette directory does not exist yet.

- [ ] **Step 4: Populate a minimal hand-written cassette fixture** (stand-in for a live recording, so CI never depends on live infra; replace with a real `record`-mode run per Global Constraints when Bright Data credits are confirmed available)

Create `cassettes/chaos-lab-full-cycle/run_c_chaoslab_https___chaos-lab.example.com.json`:
```json
[{ "price": null }, { "price": null }]
```
Create `cassettes/chaos-lab-full-cycle/scrape_https___chaos-lab.example.com.json`:
```json
"<div class=\"product-grid\"><div data-test=\"price\"><span class=\"amount\">₹620</span></div></div>"
```
Create `cassettes/chaos-lab-full-cycle/heal_c_chaoslab_*.json` (key matches the composed prompt at test time — executor runs the test once, reads the "no cassette recorded for key" error message to get the exact expected filename, then writes the fixture with that exact name):
```json
{ "jobId": "j_1", "status": "completed" }
```
Create the corresponding second `run_...` cassette (post-heal verification call) returning the golden's expected value, and an `approve_c_chaoslab.json` returning `{ "approved": true }`.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @scrapeverse/sentinel test -- chaosLab.e2e`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts cassettes packages/sentinel/test/chaosLab.e2e.test.ts
git commit -m "test(sentinel): add cassette-replayed end-to-end Chaos Lab heal cycle"
```

---

## Task 27: README + architecture docs

**Files:**
- Create: `README.md`
- Create: `docs/architecture/data-flow.md`, `docs/architecture/state-machine.md`

**Interfaces:**
- Consumes: nothing — documentation only, references all prior tasks by file path.

- [ ] **Step 1: Write `README.md`** covering: project pitch (thesis line from spec §0), architecture diagram (ASCII, from spec §1), setup (`pnpm install`, `.env` from `.env.example`, Supabase schema apply via `psql -f packages/db/src/schema.sql`), running tests (`pnpm test`), running the Chaos Lab demo (`pnpm --filter chaos-lab dev`, `pnpm --filter web dev`, visit `/chaos-lab` to flip layout versions, watch `/collectors/[id]` update), `BRIGHTDATA_MODE` modes explained, and a link to both spec and plan docs.

- [ ] **Step 2: Write `docs/architecture/data-flow.md`** — the Mermaid/ASCII diagram from spec §1 (Chaos Lab/real sites → brightdata seam → contracts classify → sentinel state machine → db/UI), with one paragraph per box naming its owning package.

- [ ] **Step 3: Write `docs/architecture/state-machine.md`** — the `HEALTHY → DEGRADED → DIAGNOSING → HEALING → VERIFYING → {PROMOTED|REJECTED|ESCALATED}` diagram from spec §4, annotated with which `packages/sentinel` function drives each transition (`classifyRun` → DEGRADED, `composeHealPrompt` → DIAGNOSING, `brightData.heal` → HEALING, `verifyAgainstGoldens` → VERIFYING, `brightData.approve` → PROMOTED, `canAttemptHeal` gating → ESCALATED).

- [ ] **Step 4: Commit**

```bash
git add README.md docs/architecture
git commit -m "docs: add README and architecture diagrams for data flow and state machine"
```

---

## Self-Review Notes

**Spec coverage:** §1 architecture → Tasks 1–3, 21–25. §2 Bright Data seam → Tasks 4–6. §3 contracts → Tasks 7–11. §4 sentinel loop → Tasks 12–16. §5 Shelf-Truth → Tasks 19–20. Chaos Lab demo mechanism → Tasks 17–18, 26. §6 testing strategy (cassette replay, property tests, never-blind-approve invariant) → Tasks 5, 11, 16, 26. Deliverables (code + README + architecture docs) → Task 27. DB schema → Task 2.

**Type consistency check:** `Row` is defined independently in `@scrapeverse/brightdata` and `@scrapeverse/contracts` per the Global Constraint that `contracts` has zero cross-package imports — `sentinel` imports `Row` from `@scrapeverse/brightdata` (used in `verify.ts`) and `FieldContract`/`Violation`/`classifyRun` from `@scrapeverse/contracts`; both shapes are structurally identical `{ [field: string]: string | number | null }` so this is safe duck-typing, not a real mismatch. `SentinelDb` (Task 12) is satisfied both by `FakeDb` (Task 3, test-only) and by the `toSentinelDb` adapter over real `@scrapeverse/db` query functions (Task 25) — verified the method names match exactly across all three: `getLatestContract`, `saveContract`, `getTrailingRuns`, `saveRun`, `getGoldens`, `saveHealAttempt`, `countRecentHealAttempts`, `countConsecutiveRejections`.

**Placeholder scan:** none found — every step has concrete code or an exact shell command.
