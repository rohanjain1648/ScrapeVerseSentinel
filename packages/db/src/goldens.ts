import { SupabaseClient } from "@supabase/supabase-js";
import { GoldenRow } from "./types";

export async function addGolden(
  client: SupabaseClient,
  golden: {
    collectorId: string;
    url: string;
    expected: unknown;
    verifiedBy: string;
  }
): Promise<string> {
  const { data, error } = await client
    .from("goldens")
    .insert({
      collector_id: golden.collectorId,
      url: golden.url,
      expected: golden.expected,
      verified_by: golden.verifiedBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getGoldens(
  client: SupabaseClient,
  collectorId: string
): Promise<GoldenRow[]> {
  const { data, error } = await client
    .from("goldens")
    .select("*")
    .eq("collector_id", collectorId);
  if (error) throw error;
  return (data ?? []) as GoldenRow[];
}
