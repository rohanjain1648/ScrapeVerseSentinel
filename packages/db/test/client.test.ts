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
