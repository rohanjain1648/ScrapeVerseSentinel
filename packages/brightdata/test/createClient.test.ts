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
    writeFileSync(join(dir, "trigger_c_1_https___example_com.json"), JSON.stringify({ snapshotId: "s_1" }));
    process.env.BRIGHTDATA_MODE = "replay";
    const client = createBrightDataClient(dir);
    const result = await client.trigger("c_1", ["https://example.com"]);
    expect(result.snapshotId).toBe("s_1");
    rmSync(dir, { recursive: true, force: true });
  });
});
