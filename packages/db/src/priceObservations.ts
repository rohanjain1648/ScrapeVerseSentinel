import { SupabaseClient } from "@supabase/supabase-js";
import { PriceObservationRow } from "./types";

export async function savePriceObservation(
  client: SupabaseClient,
  obs: {
    productId: string;
    retailer: string;
    packSizeRaw: string;
    packSizeNormalized: number;
    unit: string;
    unitPrice: number;
  }
): Promise<string> {
  const { data, error } = await client
    .from("price_observations")
    .insert({
      product_id: obs.productId,
      retailer: obs.retailer,
      pack_size_raw: obs.packSizeRaw,
      pack_size_normalized: obs.packSizeNormalized,
      unit: obs.unit,
      unit_price: obs.unitPrice,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function listByProduct(
  client: SupabaseClient,
  productId: string
): Promise<PriceObservationRow[]> {
  const { data, error } = await client
    .from("price_observations")
    .select("*")
    .eq("product_id", productId);
  if (error) throw error;
  return (data ?? []) as PriceObservationRow[];
}
