import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { classifyRun } from "../src/classify";
import { inferContract } from "../src/infer";
import { Row } from "../src/types";

describe("classifyRun property: a run drawn from the same distribution as its baseline never trips a violation", () => {
  it("holds for random well-formed currency rows", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 100, max: 1000 }), { minLength: 5, maxLength: 20 }),
        (prices) => {
          const rows: Row[] = prices.map((p) => ({ price: `₹${p}` }));
          const [contract] = inferContract([rows]);
          const violations = classifyRun([contract], rows, [rows]);
          expect(violations).toHaveLength(0);
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe("classifyRun", () => {
  it("aggregates violations from all three detectors", () => {
    const baseline = [[{ price: "₹500" }, { price: "₹600" }, { price: "₹550" }]];
    const [contract] = inferContract(baseline);
    const brokenRun = [{ price: null }, { price: null }, { price: null }];
    const violations = classifyRun([contract], brokenRun, baseline);
    expect(violations.some((v) => v.class === "STRUCTURAL")).toBe(true);
  });
});
