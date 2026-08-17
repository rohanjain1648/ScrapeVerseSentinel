create table collectors (
  id text primary key,
  name text not null,
  source_url text not null,
  target_site text not null,
  current_contract_version int not null default 0,
  state text not null default 'HEALTHY',
  created_at timestamptz not null default now()
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  collector_id text not null references collectors(id),
  version int not null,
  fields jsonb not null,
  inferred_at timestamptz not null default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  collector_id text not null references collectors(id),
  snapshot_id text,
  row_count int not null,
  rows jsonb not null,
  status text not null,
  run_at timestamptz not null default now()
);

create table violations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id),
  field text not null,
  class text not null,
  detail jsonb not null
);

create table heal_attempts (
  id uuid primary key default gen_random_uuid(),
  collector_id text not null references collectors(id),
  triggered_by_violation_id uuid references violations(id),
  prompt text not null,
  state text not null,
  verification_result jsonb,
  violations jsonb,
  decided_at timestamptz not null default now()
);

create table goldens (
  id uuid primary key default gen_random_uuid(),
  collector_id text not null references collectors(id),
  url text not null,
  expected jsonb not null,
  verified_by text not null,
  verified_at timestamptz not null default now()
);

create table price_observations (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  retailer text not null,
  pack_size_raw text not null,
  pack_size_normalized numeric not null,
  unit text not null,
  unit_price numeric not null,
  observed_at timestamptz not null default now()
);
