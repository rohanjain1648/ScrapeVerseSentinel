import { describe, it, expect } from "vitest";
import { normalizePackSize } from "../src/normalizePackSize";

describe("normalizePackSize", () => {
  it("parses simple grams", () => { expect(normalizePackSize("500g")).toEqual({ quantity: 500, unit: "g" }); });
  it("parses kilograms and converts to grams", () => { expect(normalizePackSize("0.5 kg")).toEqual({ quantity: 500, unit: "g" }); });
  it("parses litres and converts to millilitres", () => { expect(normalizePackSize("1L")).toEqual({ quantity: 1000, unit: "ml" }); });
  it("parses millilitres directly", () => { expect(normalizePackSize("250ml")).toEqual({ quantity: 250, unit: "ml" }); });
  it("parses a multi-pack declaration as total quantity", () => { expect(normalizePackSize("pack of 2 x 250g")).toEqual({ quantity: 500, unit: "g" }); });
  it("rejects multi-pack with spelled-out unit (word boundary protection)", () => { expect(() => normalizePackSize("pack of 2 x 250grams")).toThrow(); });
  it("rejects multi-pack with spelled-out litre unit (word boundary protection)", () => { expect(() => normalizePackSize("pack of 2 x 1.5liters")).toThrow(); });
  it("throws on an unparseable string", () => { expect(() => normalizePackSize("family size")).toThrow(); });
});
