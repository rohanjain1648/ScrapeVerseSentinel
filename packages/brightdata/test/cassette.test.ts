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
