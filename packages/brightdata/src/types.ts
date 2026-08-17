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
