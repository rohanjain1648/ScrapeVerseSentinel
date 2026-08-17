import { NormalizedPackSize } from "./types";

export function normalizePackSize(raw: string): NormalizedPackSize {
  const cleaned = raw.trim().toLowerCase();

  const multiPack = cleaned.match(/pack of (\d+)\s*x\s*([\d.]+)\s*(kg|g|l|ml)\b/);
  if (multiPack) {
    const [, count, qty, unit] = multiPack;
    const single = normalizeSingle(Number(qty), unit);
    return { quantity: single.quantity * Number(count), unit: single.unit };
  }

  const single = cleaned.match(/([\d.]+)\s*(kg|g|l|ml)\b/);
  if (single) {
    const [, qty, unit] = single;
    return normalizeSingle(Number(qty), unit);
  }

  throw new Error(`cannot parse pack size: "${raw}"`);
}

function normalizeSingle(qty: number, unit: string): NormalizedPackSize {
  if (unit === "kg") return { quantity: qty * 1000, unit: "g" };
  if (unit === "g") return { quantity: qty, unit: "g" };
  if (unit === "l") return { quantity: qty * 1000, unit: "ml" };
  return { quantity: qty, unit: "ml" };
}
