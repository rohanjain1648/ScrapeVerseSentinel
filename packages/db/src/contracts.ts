import { SupabaseClient } from "@supabase/supabase-js";
import { ContractRow } from "./types";

export async function saveContract(
  client: SupabaseClient,
  collectorId: string,
  version: number,
  fields: unknown
): Promise<string> {
  const { data, error } = await client
    .from("contracts")
    .insert({ collector_id: collectorId, version, fields })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getLatestContract(
  client: SupabaseClient,
  collectorId: string
): Promise<ContractRow | null> {
  const { data, error } = await client
    .from("contracts")
    .select("*")
    .eq("collector_id", collectorId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as ContractRow | null;
}
