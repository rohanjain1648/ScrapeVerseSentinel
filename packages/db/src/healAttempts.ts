import { SupabaseClient } from "@supabase/supabase-js";
import { HealAttemptRow } from "./types";

export async function saveHealAttempt(
  client: SupabaseClient,
  attempt: {
    collectorId: string;
    triggeredByViolationId?: string | null;
    prompt: string;
    state: string;
    verificationResult?: unknown;
    violations?: unknown[];
    decidedAt?: string;
  }
): Promise<string> {
  const { data, error } = await client
    .from("heal_attempts")
    .insert({
      collector_id: attempt.collectorId,
      triggered_by_violation_id: attempt.triggeredByViolationId ?? null,
      prompt: attempt.prompt,
      state: attempt.state,
      verification_result: attempt.verificationResult ?? null,
      violations: attempt.violations ?? null,
      decided_at: attempt.decidedAt ?? new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function countRecentHealAttempts(
  client: SupabaseClient,
  collectorId: string,
  sinceHours: number
): Promise<number> {
  const cutoff = new Date(Date.now() - sinceHours * 3600_000).toISOString();
  const { count, error } = await client
    .from("heal_attempts")
    .select("*", { count: "exact", head: true })
    .eq("collector_id", collectorId)
    .gte("decided_at", cutoff);
  if (error) throw error;
  return count ?? 0;
}

export async function listHealAttempts(
  client: SupabaseClient,
  collectorId: string,
  limit: number
): Promise<HealAttemptRow[]> {
  const { data, error } = await client
    .from("heal_attempts")
    .select("*")
    .eq("collector_id", collectorId)
    .order("decided_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as HealAttemptRow[];
}

export async function countConsecutiveRejections(
  client: SupabaseClient,
  collectorId: string
): Promise<number> {
  const { data, error } = await client
    .from("heal_attempts")
    .select("*")
    .eq("collector_id", collectorId)
    .order("decided_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as HealAttemptRow[];
  let count = 0;
  for (const row of rows) {
    if (row.state === "REJECTED") count++;
    else break;
  }
  return count;
}
