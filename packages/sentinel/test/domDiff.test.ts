import { describe, it, expect } from "vitest";
import { diffDom } from "../src/domDiff";

describe("diffDom", () => {
  it("reports which class/attribute selectors disappeared between two HTML snapshots", () => {
    const oldHtml = `<div class="product-grid"><div class="card"><span class="price">₹100</span></div></div>`;
    const newHtml = `<div class="product-grid"><div data-test="price"><span class="amount">₹100</span></div></div>`;
    const diff = diffDom(oldHtml, newHtml);
    expect(diff).toContain("card");
    expect(diff).toContain("price");
  });

  it("returns a no-op message when the two snapshots are structurally identical", () => {
    const html = `<div class="card"><span class="price">₹100</span></div>`;
    expect(diffDom(html, html)).toMatch(/no structural change/i);
  });
});
