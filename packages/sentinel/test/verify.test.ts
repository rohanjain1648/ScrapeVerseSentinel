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

  it("refuses to pass when no goldens are configured for the collector", async () => {
    const client = fakeClient({});
    const result = await verifyAgainstGoldens(client, "c_1", [], contracts);
    expect(result.passed).toBe(false);
    expect(result.details).toMatch(/no golden/i);
  });

  it("fails when a golden's URL returns zero rows from the healed collector", async () => {
    const client = fakeClient({}); // "https://example.com/p1" is absent from the response map
    const result = await verifyAgainstGoldens(client, "c_1", [{ url: "https://example.com/p1", expected: { price: "₹1,284" } }], contracts);
    expect(result.passed).toBe(false);
    expect(result.details).toContain("p1");
    expect(result.details).toMatch(/no rows/i);
  });

  it("does not reject and reports all goldens when runCollector throws for one of them", async () => {
    const client: BrightDataClient = {
      trigger: async () => ({ snapshotId: "s" }),
      getDataset: async () => ({ status: "ready", rows: [] }),
      runCollector: async (_id, url) => {
        if (url === "https://example.com/broken") {
          throw new Error("network timeout");
        }
        return [{ price: "₹1,284" }];
      },
      heal: async () => ({ jobId: "j", status: "completed" }),
      approve: async () => ({ approved: true }),
      scrape: async () => "",
    };

    const goldens = [
      { url: "https://example.com/broken", expected: { price: "₹1,284" } },
      { url: "https://example.com/p1", expected: { price: "₹1,284" } },
    ];

    const result = await verifyAgainstGoldens(client, "c_1", goldens, contracts);

    expect(result.passed).toBe(false);
    expect(result.details).toContain("broken");
    expect(result.details).toMatch(/runCollector threw|network timeout/i);
  });
});
