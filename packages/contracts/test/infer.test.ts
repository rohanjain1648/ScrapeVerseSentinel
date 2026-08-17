import { describe, it, expect } from "vitest";
import { inferContract } from "../src/infer";

describe("inferContract", () => {
  it("infers a currency contract with numeric range and null rate from healthy runs", () => {
    const runs = [
      [{ price: "₹1,284" }, { price: "₹500" }, { price: null }],
      [{ price: "₹1,300" }, { price: "₹480" }, { price: "₹900" }],
    ];
    const [contract] = inferContract(runs);
    expect(contract.name).toBe("price");
    expect(contract.type).toBe("currency");
    expect(contract.currency).toBe("INR");
    expect(contract.numericRange!.min).toBeLessThanOrEqual(480);
    expect(contract.numericRange!.max).toBeGreaterThanOrEqual(1300);
    expect(contract.nullRate.max).toBeGreaterThan(0);
  });

  it("infers a plain number contract when no currency symbol is present", () => {
    const runs = [[{ points: 42 }, { points: 100 }]];
    const [contract] = inferContract(runs);
    expect(contract.type).toBe("number");
  });

  it("infers string type for all-null field instead of defaulting to number", () => {
    const runs = [
      [{ nullField: null }, { nullField: null }],
      [{ nullField: null }, { nullField: null }],
    ];
    const [contract] = inferContract(runs);
    expect(contract.name).toBe("nullField");
    expect(contract.type).toBe("string");
    expect(contract.nullRate.p50).toBe(1);
    expect(contract.numericRange).toBeUndefined();
  });

  it("infers currency contract with decimal values correctly", () => {
    const runs = [
      [{ cost: "₹99.50" }, { cost: "$19.99" }, { cost: "€12.75" }],
      [{ cost: "£5.50" }, { cost: "₹150.25" }],
    ];
    const [contract] = inferContract(runs);
    expect(contract.name).toBe("cost");
    expect(contract.type).toBe("currency");
    expect(contract.numericRange).toBeDefined();
    expect(contract.numericRange!.min).toBeLessThanOrEqual(5.5);
    expect(contract.numericRange!.max).toBeGreaterThanOrEqual(150.25);
  });
});
