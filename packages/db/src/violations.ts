import { SupabaseClient } from "@supabase/supabase-js";
import { ViolationRow } from "./types";

export async function saveViolations(
  client: SupabaseClient,
  runId: string,
  violations: { field: string; class: string; detail: unknown }[]
): Promise<void> {
  if (violations.length === 0) return;
  const { error } = await client.from("violations").insert(
    violations.map((v) => ({ run_id: runId, field: v.field, class: v.class, detail: v.detail }))
  );
  if (error) throw error;
}

export async function listViolations(
  client: SupabaseClient,
  collectorId: string,
  limit: number
): Promise<ViolationRow[]> {
  const { data, error } = await client
    .from("violations")
    .select("*, runs!inner(collector_id)")
    .eq("runs.collector_id", collectorId)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ViolationRow[];
}
