import { describe, it, expect } from "vitest";
import { computeUnitPrice } from "../src/unitPrice";

describe("computeUnitPrice", () => {
  it("computes ₹ per 100g for a gram-based pack", () => {
    expect(computeUnitPrice(620, { quantity: 5000, unit: "g" })).toBeCloseTo(12.4, 1); // ₹620 / 5000g * 100
  });
  it("computes ₹ per 100ml for a millilitre-based pack", () => {
    expect(computeUnitPrice(185, { quantity: 1000, unit: "ml" })).toBeCloseTo(18.5, 1);
  });
});
