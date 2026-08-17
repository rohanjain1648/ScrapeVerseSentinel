import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Cassette keys can be arbitrarily long (e.g. `heal:${id}:${prompt}` embeds
// a full multi-line heal prompt). Sanitized verbatim, a long key produces a
// filename that exceeds common filesystems' per-component length limit
// (NTFS/ext4: ~255 chars) and cannot be created at all. Keys at or under
// MAX_LEN are unaffected — same filename as always, so every cassette
// already on disk keeps resolving correctly. Keys over MAX_LEN are
// truncated and given a short hash suffix derived from the ORIGINAL
// (unsanitized) key, so two long keys that happen to share the same first
// MAX_LEN sanitized characters still land on distinct files.
function keyToPath(dir: string, key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_-]/g, "_");
  const MAX_LEN = 150;
  const finalKey =
    safe.length > MAX_LEN
      ? `${safe.slice(0, MAX_LEN)}_${createHash("sha256").update(key).digest("hex").slice(0, 16)}`
      : safe;
  return join(dir, `${finalKey}.json`);
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
