import { normalizePackSize } from "./normalizePackSize";
import { computeUnitPrice } from "./unitPrice";

export interface ProductSnapshot {
  productId: string;
  retailer: string;
  packSizeRaw: string;
  price: number;
  observedAt: string;
}

export interface ShrinkflationFlag {
  productId: string;
  retailer: string;
  previousUnitPrice: number;
  currentUnitPrice: number;
  unitPriceIncreasePct: number;
  packSizeChange: string;
}

const MIN_INCREASE_PCT_TO_FLAG = 1; // ignore noise below 1% unit-price increase

export function detectShrinkflation(
  previous: ProductSnapshot,
  current: ProductSnapshot
): ShrinkflationFlag | null {
  const previousPack = normalizePackSize(previous.packSizeRaw);
  const currentPack = normalizePackSize(current.packSizeRaw);
  if (previousPack.unit !== currentPack.unit) return null; // can't compare across g/ml

  const previousUnitPrice = computeUnitPrice(previous.price, previousPack);
  const currentUnitPrice = computeUnitPrice(current.price, currentPack);

  if (currentPack.quantity >= previousPack.quantity) return null; // pack didn't shrink

  const increasePct = ((currentUnitPrice - previousUnitPrice) / previousUnitPrice) * 100;
  if (increasePct < MIN_INCREASE_PCT_TO_FLAG) return null;

  return {
    productId: current.productId,
    retailer: current.retailer,
    previousUnitPrice,
    currentUnitPrice,
    unitPriceIncreasePct: increasePct,
    packSizeChange: `${previous.packSizeRaw} -> ${current.packSizeRaw}`,
  };
}
