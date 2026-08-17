// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { renderStorefront } from "../lib/layoutVersions";
import { PRODUCTS } from "../lib/products";

describe("renderStorefront", () => {
  it("v1 exposes .product-grid > .card .price with the ₹ symbol", () => {
    const { container } = render(renderStorefront("v1", PRODUCTS));
    const priceEl = container.querySelector(".product-grid > .card .price");
    expect(priceEl?.textContent).toMatch(/^₹\d/);
  });

  it("v2 exposes [data-test=\"price\"] > span.amount and no longer matches the v1 selector", () => {
    const { container } = render(renderStorefront("v2", PRODUCTS));
    expect(container.querySelector(".product-grid > .card .price")).toBeNull();
    const priceEl = container.querySelector('[data-test="price"] > span.amount');
    expect(priceEl?.textContent).toMatch(/^₹\d/);
  });

  it("v3 fully restructures the DOM (no .card, no [data-test=price])", () => {
    const { container } = render(renderStorefront("v3", PRODUCTS));
    expect(container.querySelector(".card")).toBeNull();
    expect(container.querySelector('[data-test="price"]')).toBeNull();
  });

  it("semantic mutation keeps the v1 selector but drops the ₹ symbol from the text", () => {
    const { container } = render(renderStorefront("semantic", PRODUCTS));
    const priceEl = container.querySelector(".product-grid > .card .price");
    expect(priceEl).not.toBeNull();
    expect(priceEl?.textContent).not.toMatch(/₹/);
    expect(priceEl?.textContent).toMatch(/^\d+$/);
  });
});
