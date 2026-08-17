import { SupabaseClient } from "@supabase/supabase-js";
import { RunRow } from "./types";

export async function saveRun(
  client: SupabaseClient,
  collectorId: string,
  rows: unknown[],
  status: string,
  snapshotId?: string
): Promise<string> {
  const { data, error } = await client
    .from("runs")
    .insert({ collector_id: collectorId, rows, row_count: rows.length, status, snapshot_id: snapshotId ?? null })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function getTrailingRuns(
  client: SupabaseClient,
  collectorId: string,
  n: number
): Promise<RunRow[]> {
  const { data, error } = await client
    .from("runs")
    .select("*")
    .eq("collector_id", collectorId)
    .order("run_at", { ascending: false })
    .limit(n);
  if (error) throw error;
  return (data ?? []) as RunRow[];
}
