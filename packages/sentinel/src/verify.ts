import { BrightDataClient, Row } from "@scrapeverse/brightdata";
import { FieldContract, classifyRun } from "@scrapeverse/contracts";
import { GoldenRecord } from "./types";

export async function verifyAgainstGoldens(
  client: BrightDataClient,
  collectorId: string,
  goldens: GoldenRecord[],
  contracts: FieldContract[]
): Promise<{ passed: boolean; details: string }> {
  if (goldens.length === 0) {
    return { passed: false, details: "no golden records configured for this collector — cannot verify a heal, refusing to promote" };
  }

  const failures: string[] = [];

  for (const golden of goldens) {
    let rows: Row[];
    try {
      rows = await client.runCollector(collectorId, golden.url);
    } catch (err) {
      failures.push(`${golden.url}: runCollector threw: ${err}`);
      continue;
    }

    const row = rows[0];

    if (!row) {
      failures.push(`${golden.url}: healed collector returned no rows`);
      continue;
    }

    for (const [field, expectedValue] of Object.entries(golden.expected)) {
      if (row[field] !== expectedValue) {
        failures.push(`${golden.url}: field "${field}" expected "${expectedValue}", got "${row[field]}"`);
      }
    }

    const violations = classifyRun(contracts, rows);
    if (violations.length > 0) {
      failures.push(`${golden.url}: healed run still violates contract: ${violations.map((v) => v.detail).join("; ")}`);
    }
  }

  return {
    passed: failures.length === 0,
    details: failures.length === 0 ? `all ${goldens.length} golden record(s) reproduced` : failures.join(" | "),
  };
}
