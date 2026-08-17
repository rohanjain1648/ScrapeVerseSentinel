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

  it("retries on 429 (Too Many Requests) instead of fast-failing", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ready", rows: [] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new LiveBrightDataClient({ apiKey: "k", baseUrl: "https://api.brightdata.com", retryDelayMs: 1 });
    const result = await client.getDataset("s_123");
    expect(result.status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries when fetch() itself throws a network-level error", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ready", rows: [] }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new LiveBrightDataClient({ apiKey: "k", baseUrl: "https://api.brightdata.com", retryDelayMs: 1 });
    const result = await client.getDataset("s_123");
    expect(result.status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on a persistent network-level failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new LiveBrightDataClient({ apiKey: "k", baseUrl: "https://api.brightdata.com", retryDelayMs: 1, maxRetries: 2 });
    await expect(client.getDataset("s_123")).rejects.toThrow(/network error/);
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });
});
