import { describe, it, expect } from "vitest";
import { detectStructural } from "../src/structural";
import { FieldContract } from "../src/types";

const contract: FieldContract = {
  name: "price", description: "price", type: "currency", currency: "INR",
  nullRate: { p50: 0.02, max: 0.1 },
};

describe("detectStructural", () => {
  it("flags a field whose null rate on this run exceeds the contract max", () => {
    const run = [{ price: null }, { price: null }, { price: "₹100" }];
    const violations = detectStructural([contract], run);
    expect(violations).toHaveLength(1);
    expect(violations[0].class).toBe("STRUCTURAL");
    expect(violations[0].field).toBe("price");
  });

  it("does not flag when null rate is within bounds", () => {
    const run = [{ price: "₹100" }, { price: "₹200" }, { price: "₹300" }];
    expect(detectStructural([contract], run)).toHaveLength(0);
  });

  it("flags row-count collapse against a trailing median", () => {
    const violations = detectStructural([contract], [{ price: "₹100" }], { trailingMedianRowCount: 20 });
    expect(violations.some((v) => v.detail.includes("row count"))).toBe(true);
  });
});
