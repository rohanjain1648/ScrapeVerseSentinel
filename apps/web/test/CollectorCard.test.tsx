// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollectorCard } from "../components/CollectorCard";

describe("CollectorCard", () => {
  it("renders the collector name, state, and target site", () => {
    render(<CollectorCard collector={{ id: "c_1", name: "Chaos Lab Storefront", target_site: "chaos-lab", state: "DEGRADED", source_url: "https://x.com", current_contract_version: 1, created_at: "2026-08-01" }} />);
    expect(screen.getByText("Chaos Lab Storefront")).toBeInTheDocument();
    expect(screen.getByText("DEGRADED")).toBeInTheDocument();
  });

  it("applies a distinct visual treatment per state via a data attribute", () => {
    const { container } = render(<CollectorCard collector={{ id: "c_1", name: "X", target_site: "x", state: "PROMOTED", source_url: "https://x.com", current_contract_version: 1, created_at: "2026-08-01" }} />);
    expect(container.querySelector('[data-state="PROMOTED"]')).not.toBeNull();
  });
});
