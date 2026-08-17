import { FieldContract, Row, Violation } from "./types";

export function detectStructural(
  contracts: FieldContract[],
  run: Row[],
  opts?: { trailingMedianRowCount?: number }
): Violation[] {
  const violations: Violation[] = [];

  if (opts?.trailingMedianRowCount && opts.trailingMedianRowCount > 0) {
    if (run.length < opts.trailingMedianRowCount * 0.5) {
      violations.push({
        class: "STRUCTURAL",
        field: "*",
        detail: `row count collapsed: ${run.length} vs trailing median ${opts.trailingMedianRowCount}`,
        evidence: { expected: `~${opts.trailingMedianRowCount} rows`, observed: `${run.length} rows`, sampleRows: run.slice(0, 3) },
      });
    }
  }

  for (const contract of contracts) {
    if (run.length === 0) continue;
    const nulls = run.filter((r) => (r[contract.name] ?? null) === null).length;
    const rate = nulls / run.length;
    if (rate > contract.nullRate.max) {
      violations.push({
        class: "STRUCTURAL",
        field: contract.name,
        detail: `null rate ${(rate * 100).toFixed(0)}% exceeds contract max ${(contract.nullRate.max * 100).toFixed(0)}%`,
        evidence: { expected: `null rate <= ${contract.nullRate.max}`, observed: `null rate ${rate}`, sampleRows: run.slice(0, 3) },
      });
    }
  }
  return violations;
}
