export interface CollectorRow {
  id: string;
  name: string;
  source_url: string;
  target_site: string;
  current_contract_version: number;
  state: string;
  created_at: string;
}

export interface ContractRow {
  id: string;
  collector_id: string;
  version: number;
  fields: unknown;
  inferred_at: string;
}

export interface RunRow {
  id: string;
  collector_id: string;
  snapshot_id: string | null;
  row_count: number;
  rows: unknown;
  status: string;
  run_at: string;
}

export interface ViolationRow {
  id: string;
  run_id: string;
  field: string;
  class: string;
  detail: unknown;
}

export interface HealAttemptRow {
  id: string;
  collector_id: string;
  triggered_by_violation_id: string | null;
  prompt: string;
  state: string;
  verification_result: unknown;
  violations?: unknown;
  decided_at: string;
}

export interface GoldenRow {
  id: string;
  collector_id: string;
  url: string;
  expected: unknown;
  verified_by: string;
  verified_at: string;
}

export interface PriceObservationRow {
  id: string;
  product_id: string;
  retailer: string;
  pack_size_raw: string;
  pack_size_normalized: number;
  unit: string;
  unit_price: number;
  observed_at: string;
}
