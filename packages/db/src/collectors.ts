import { SupabaseClient } from "@supabase/supabase-js";
import { CollectorRow } from "./types";

export async function upsertCollector(
  client: SupabaseClient,
  row: Partial<CollectorRow> & { id: string }
): Promise<CollectorRow> {
  const { data, error } = await client
    .from("collectors")
    .upsert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data as CollectorRow;
}

export async function listCollectors(client: SupabaseClient): Promise<CollectorRow[]> {
  const { data, error } = await client.from("collectors").select("*");
  if (error) throw error;
  return (data ?? []) as CollectorRow[];
}

export async function getCollector(
  client: SupabaseClient,
  id: string
): Promise<CollectorRow | null> {
  const { data, error } = await client
    .from("collectors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as CollectorRow | null;
}

export async function setCollectorState(
  client: SupabaseClient,
  id: string,
  state: string
): Promise<void> {
  const { error } = await client.from("collectors").update({ state }).eq("id", id);
  if (error) throw error;
}
