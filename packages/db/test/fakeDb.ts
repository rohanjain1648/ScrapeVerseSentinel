// Local stand-ins — replace with real imports from @scrapeverse/contracts /
// @scrapeverse/sentinel once those packages exist (Tasks 7, 12). Keep these
// shapes in sync with those packages' actual exported types.
interface FieldContract {
  name: string;
  description: string;
  type: "currency" | "number" | "string" | "date" | "url" | "enum";
  currency?: string;
  pattern?: string;
  nullRate: { p50: number; max: number };
  numericRange?: { min: number; max: number };
  categoricalValues?: string[];
}

interface Violation {
  class: "STRUCTURAL" | "SEMANTIC" | "DRIFT";
  field: string;
  detail: string;
  evidence: { expected: string; observed: string; sampleRows: unknown[] };
}

interface GoldenRecord {
  url: string;
  expected: Record<string, string | number | null>;
}

interface HealAttemptRecord {
  collectorId: string;
  violations: Violation[];
  prompt: string;
  state: string;
  verificationResult?: { goldensPassed: boolean; details: string };
  decidedAt: string;
}

export class FakeDb {
  private contracts = new Map<string, FieldContract[]>();
  private runs = new Map<string, { rows: unknown[]; status: string; run_at: string }[]>();
  private goldens = new Map<string, GoldenRecord[]>();
  private healAttempts: (HealAttemptRecord & { id: string })[] = [];
  private savedViolations: { runId: string; violations: Violation[] }[] = [];

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
  async saveViolations(runId: string, violations: Violation[]) {
    this.savedViolations.push({ runId, violations });
  }
  // Test-only accessor: exposes what saveViolations was called with, so
  // tests can assert violations were actually persisted (not just classified).
  getSavedViolations() {
    return this.savedViolations;
  }
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
  // Test-only accessor: exposes the persisted heal attempt audit trail so
  // tests can assert on what actually got written, not just derived state.
  getHealAttempts(collectorId: string) {
    return this.healAttempts.filter((a) => a.collectorId === collectorId);
  }
}
