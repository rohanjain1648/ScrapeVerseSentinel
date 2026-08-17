import { NormalizedPackSize } from "./types";

export function computeUnitPrice(price: number, pack: NormalizedPackSize): number {
  return (price / pack.quantity) * 100;
}
