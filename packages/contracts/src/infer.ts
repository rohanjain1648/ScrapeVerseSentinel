import { FieldContract, FieldType, Row } from "./types";

const CURRENCY_SYMBOLS: Record<string, string> = {
  "₹": "INR",
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
};

const CURRENCY_SYMBOL_CHARS = Object.keys(CURRENCY_SYMBOLS).join("");
const CURRENCY_PATTERN = new RegExp(`^[${CURRENCY_SYMBOL_CHARS}]\\s?[\\d,]+(\\.\\d{1,2})?$`);

function parseNumeric(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === "number") return value;
  const cleaned = value.replace(new RegExp(`[${CURRENCY_SYMBOL_CHARS},\\s]`, "g"), "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function detectCurrency(value: string): string | null {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (value.startsWith(symbol)) return code;
  }
  return null;
}

function inferType(values: (string | number | null)[]): { type: FieldType; currency?: string } {
  const nonNull = values.filter((v): v is string | number => v !== null);
  const currencyMatches = nonNull.filter((v) => typeof v === "string" && CURRENCY_PATTERN.test(v));
  if (currencyMatches.length > 0 && currencyMatches.length === nonNull.length) {
    return { type: "currency", currency: detectCurrency(currencyMatches[0] as string) ?? undefined };
  }
  if (nonNull.length > 0 && nonNull.every((v) => typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)))) {
    return { type: "number" };
  }
  return { type: "string" };
}

export function inferContract(healthyRuns: Row[][]): FieldContract[] {
  const fieldNames = new Set<string>();
  for (const run of healthyRuns) for (const row of run) for (const k of Object.keys(row)) fieldNames.add(k);

  const contracts: FieldContract[] = [];
  for (const name of fieldNames) {
    const allValues: (string | number | null)[] = [];
    let totalRows = 0;
    let nullRows = 0;
    for (const run of healthyRuns) {
      for (const row of run) {
        totalRows++;
        const v = row[name] ?? null;
        allValues.push(v);
        if (v === null) nullRows++;
      }
    }
    const { type, currency } = inferType(allValues);
    const numerics = allValues.map(parseNumeric).filter((n): n is number => n !== null);
    const p50NullRate = totalRows > 0 ? nullRows / totalRows : 0;

    contracts.push({
      name,
      description: name,
      type,
      currency,
      nullRate: { p50: p50NullRate, max: Math.min(1, p50NullRate + 0.15) },
      numericRange: numerics.length > 0 ? { min: Math.min(...numerics), max: Math.max(...numerics) } : undefined,
    });
  }
  return contracts;
}
