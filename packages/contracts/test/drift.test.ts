import { describe, it, expect } from "vitest";
import { detectDrift } from "../src/drift";
import { FieldContract, Row } from "../src/types";

const contract: FieldContract = {
  name: "price", description: "sale price", type: "currency", currency: "INR",
  nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 100, max: 2000 },
};

function runOf(prices: number[]): Row[] {
  return prices.map((p) => ({ price: `₹${p}` }));
}

describe("detectDrift", () => {
  it("does not flag a run whose distribution matches the baseline", () => {
    const baseline = [runOf([500, 600, 550, 620, 580]), runOf([510, 590, 560, 610, 570])];
    const current = runOf([505, 595, 555, 615, 575]);
    expect(detectDrift([contract], baseline, current)).toHaveLength(0);
  });

  it("flags a run whose distribution has shifted materially from baseline (e.g. MSRP swapped in for sale price)", () => {
    const baseline = [runOf([500, 600, 550, 620, 580]), runOf([510, 590, 560, 610, 570])];
    const current = runOf([1400, 1450, 1500, 1480, 1520]); // consistently ~2.5x higher, still "in range" per hard bounds
    const violations = detectDrift([contract], baseline, current);
    expect(violations).toHaveLength(1);
    expect(violations[0].class).toBe("DRIFT");
  });
});
