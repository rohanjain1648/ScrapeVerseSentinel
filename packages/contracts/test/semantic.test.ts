import { describe, it, expect } from "vitest";
import { detectSemantic } from "../src/semantic";
import { FieldContract } from "../src/types";

const contract: FieldContract = {
  name: "price", description: "price incl currency symbol", type: "currency", currency: "INR",
  nullRate: { p50: 0.02, max: 0.1 }, numericRange: { min: 12, max: 5000 },
};

describe("detectSemantic", () => {
  it("flags a currency field that lost its currency symbol", () => {
    const run = [{ price: "1284" }, { price: "500" }];
    const violations = detectSemantic([contract], run);
    expect(violations.some((v) => v.class === "SEMANTIC" && v.field === "price")).toBe(true);
  });

  it("flags a numeric value outside the hard range", () => {
    const run = [{ price: "₹99999" }];
    const violations = detectSemantic([contract], run);
    expect(violations.some((v) => v.detail.includes("range"))).toBe(true);
  });

  it("does not flag well-formed in-range currency values", () => {
    const run = [{ price: "₹1,284" }, { price: "₹500" }];
    expect(detectSemantic([contract], run)).toHaveLength(0);
  });
});
