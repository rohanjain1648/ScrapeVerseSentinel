import { FieldContract, Row, Violation } from "./types";
import { detectStructural } from "./structural";
import { detectSemantic } from "./semantic";
import { detectDrift } from "./drift";

export function classifyRun(
  contracts: FieldContract[],
  currentRun: Row[],
  baselineRuns: Row[][] = [],
  opts?: { trailingMedianRowCount?: number }
): Violation[] {
  return [
    ...detectStructural(contracts, currentRun, opts),
    ...detectSemantic(contracts, currentRun),
    ...detectDrift(contracts, baselineRuns, currentRun),
  ];
}
