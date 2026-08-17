import { describe, it, expect } from "vitest";
import { composeHealPrompt } from "../src/promptSynth";
import { Violation } from "@scrapeverse/contracts";

describe("composeHealPrompt", () => {
  it("includes the field description, violation detail, and dom diff evidence", () => {
    const violations: Violation[] = [{
      class: "STRUCTURAL", field: "price",
      detail: "null rate 98% exceeds contract max 10%",
      evidence: { expected: "null rate <= 0.1", observed: "null rate 0.98", sampleRows: [] },
    }];
    const prompt = composeHealPrompt(
      violations,
      { price: "current selling price including the ₹ symbol" },
      "removed selectors: .price | new selectors: [data-test]"
    );
    expect(prompt).toContain("current selling price including the ₹ symbol");
    expect(prompt).toContain("null rate 98%");
    expect(prompt).toContain("[data-test]");
  });

  it("distinguishes DRIFT violations with explicit wrong-field language", () => {
    const violations: Violation[] = [{
      class: "DRIFT", field: "price",
      detail: "distribution shifted (PSI=0.40): baseline mean 550 vs current mean 1470",
      evidence: { expected: "mean ~550", observed: "mean 1470", sampleRows: [] },
    }];
    const prompt = composeHealPrompt(violations, { price: "sale price" }, "no structural change detected between snapshots");
    expect(prompt.toLowerCase()).toContain("not the struck-through");
  });
});
