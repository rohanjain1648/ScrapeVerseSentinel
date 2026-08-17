import { describe, it, expect } from "vitest";
import { detectShrinkflation } from "../src/shrinkflation";

const base = { productId: "p1", retailer: "bigbasket", observedAt: "2026-08-01" };

describe("detectShrinkflation", () => {
  it("flags a product whose pack shrank while unit price rose", () => {
    const previous = { ...base, packSizeRaw: "1kg", price: 100 };
    const current = { ...base, packSizeRaw: "900g", price: 100, observedAt: "2026-08-06" };
    const flag = detectShrinkflation(previous, current);
    expect(flag).not.toBeNull();
    expect(flag!.unitPriceIncreasePct).toBeCloseTo(11.1, 1);
  });

  it("does not flag when pack size and price both stay constant", () => {
    const previous = { ...base, packSizeRaw: "1kg", price: 100 };
    const current = { ...base, packSizeRaw: "1kg", price: 100, observedAt: "2026-08-06" };
    expect(detectShrinkflation(previous, current)).toBeNull();
  });

  it("does not flag when pack size shrank but price fell proportionally too", () => {
    const previous = { ...base, packSizeRaw: "1kg", price: 100 };
    const current = { ...base, packSizeRaw: "900g", price: 90, observedAt: "2026-08-06" };
    expect(detectShrinkflation(previous, current)).toBeNull();
  });
});
