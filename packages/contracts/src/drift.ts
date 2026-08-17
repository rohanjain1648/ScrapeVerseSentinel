import { FieldContract, Row, Violation } from "./types";

function parseNumeric(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[₹$€£,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// Population Stability Index between two numeric samples, using equal-width
// bins spanned by the union of both samples' ranges.
function psi(baseline: number[], current: number[], bins = 5): number {
  if (baseline.length === 0 || current.length === 0) return 0;
  const all = [...baseline, ...current];
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (min === max) return 0;
  const width = (max - min) / bins;

  const bucket = (v: number) => Math.min(bins - 1, Math.floor((v - min) / width));
  const hist = (values: number[]) => {
    const counts = new Array(bins).fill(0);
    for (const v of values) counts[bucket(v)]++;
    return counts.map((c) => Math.max(c / values.length, 1e-6)); // avoid div-by-zero / log(0)
  };

  const b = hist(baseline);
  const c = hist(current);
  let total = 0;
  for (let i = 0; i < bins; i++) {
    total += (c[i] - b[i]) * Math.log(c[i] / b[i]);
  }
  return total;
}

const PSI_DRIFT_THRESHOLD = 0.25; // conventional PSI cutoff: >0.25 = significant distribution shift

export function detectDrift(
  contracts: FieldContract[],
  baselineRuns: Row[][],
  currentRun: Row[]
): Violation[] {
  const violations: Violation[] = [];

  for (const contract of contracts) {
    if (contract.type !== "currency" && contract.type !== "number") continue;

    const baselineValues = baselineRuns.flat().map((r) => parseNumeric(r[contract.name] ?? null)).filter((n): n is number => n !== null);
    const currentValues = currentRun.map((r) => parseNumeric(r[contract.name] ?? null)).filter((n): n is number => n !== null);
    if (baselineValues.length < 3 || currentValues.length < 3) continue; // not enough data to judge drift

    const score = psi(baselineValues, currentValues);
    if (score > PSI_DRIFT_THRESHOLD) {
      const baselineMean = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
      const currentMean = currentValues.reduce((a, b) => a + b, 0) / currentValues.length;
      violations.push({
        class: "DRIFT",
        field: contract.name,
        detail: `distribution shifted (PSI=${score.toFixed(2)}): baseline mean ${baselineMean.toFixed(2)} vs current mean ${currentMean.toFixed(2)} — value is well-typed and in range but likely the wrong field (e.g. MSRP instead of sale price)`,
        evidence: { expected: `mean ~${baselineMean.toFixed(2)}`, observed: `mean ${currentMean.toFixed(2)}`, sampleRows: currentRun.slice(0, 3) },
      });
    }
  }
  return violations;
}
