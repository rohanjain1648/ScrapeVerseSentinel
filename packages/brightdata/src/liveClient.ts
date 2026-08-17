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
      let res: Response;
      try {
        res = await fetch(`${this.config.baseUrl}${path}`, {
          ...init,
          headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
        });
      } catch (err) {
        // Network-level failure (DNS/socket/etc.) — treat the same as a
        // retryable HTTP failure rather than letting it escape the loop.
        attempt++;
        if (attempt > this.maxRetries) {
          throw new Error(`Bright Data request failed after ${attempt} attempts: network error ${path}: ${String(err)}`);
        }
        await new Promise((r) => setTimeout(r, this.retryDelayMs * attempt));
        continue;
      }
      if (res.ok) return res.json();
      // 429 (Too Many Requests) is the most likely transient failure against a
      // scraping API and must go through the retry loop below, not fast-fail
      // alongside genuine client errors like 404/401.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
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
    return { status: data.status ?? "running", rows: data.rows as Row[] | undefined };
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
