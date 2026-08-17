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
  saveViolations(runId: string, violations: Violation[]): Promise<void>;
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
  reason?: string;
}
