// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShrinkflationTable } from "../components/ShrinkflationTable";

describe("ShrinkflationTable", () => {
  it("renders one row per flagged product with its unit-price increase", () => {
    render(<ShrinkflationTable flags={[{
      productId: "p1", retailer: "bigbasket", previousUnitPrice: 10, currentUnitPrice: 11.1,
      unitPriceIncreasePct: 11.1, packSizeChange: "1kg -> 900g",
    }]} />);
    expect(screen.getByText("bigbasket")).toBeInTheDocument();
    expect(screen.getByText(/11\.1%/)).toBeInTheDocument();
    expect(screen.getByText("1kg -> 900g")).toBeInTheDocument();
  });

  it("renders an empty state when no shrinkflation is detected", () => {
    render(<ShrinkflationTable flags={[]} />);
    expect(screen.getByText(/no shrinkflation detected/i)).toBeInTheDocument();
  });
});
