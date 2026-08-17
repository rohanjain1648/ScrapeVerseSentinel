import { FieldContract, Row, Violation } from "./types";

const CURRENCY_SYMBOLS: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

function parseNumeric(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  const cleaned = value.replace(/[₹$€£,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function detectSemantic(contracts: FieldContract[], run: Row[]): Violation[] {
  const violations: Violation[] = [];

  for (const contract of contracts) {
    const values = run.map((r) => r[contract.name] ?? null).filter((v): v is string | number => v !== null);
    if (values.length === 0) continue;

    if (contract.type === "currency" && contract.currency) {
      const symbol = CURRENCY_SYMBOLS[contract.currency];
      const missingSymbol = values.filter((v) => typeof v === "string" && symbol && !v.includes(symbol));
      if (symbol && missingSymbol.length === values.length) {
        violations.push({
          class: "SEMANTIC",
          field: contract.name,
          detail: `currency symbol "${symbol}" missing from all ${values.length} values — field appears to have lost its currency formatting`,
          evidence: { expected: `values matching /${symbol}.../`, observed: String(missingSymbol[0]), sampleRows: run.slice(0, 3) },
        });
      }
    }

    if (contract.numericRange) {
      const outOfRange = run.filter((r) => {
        const n = parseNumeric(r[contract.name] ?? null);
        return n !== null && (n < contract.numericRange!.min * 0.5 || n > contract.numericRange!.max * 1.5);
      });
      if (outOfRange.length > 0) {
        violations.push({
          class: "SEMANTIC",
          field: contract.name,
          detail: `${outOfRange.length} value(s) fall outside expected range [${contract.numericRange.min}, ${contract.numericRange.max}]`,
          evidence: { expected: `[${contract.numericRange.min}, ${contract.numericRange.max}]`, observed: String(outOfRange[0][contract.name]), sampleRows: outOfRange.slice(0, 3) },
        });
      }
    }
  }
  return violations;
}
