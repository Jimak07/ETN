-- ==============================================================================
-- ETNVerse Suite: Complete Unified Database Schema & Migration
-- Backed by Supabase with Row Level Security (RLS)
-- Connects to: https://vkivqsrvmvllkkeaeyad.supabase.co
--
-- Includes:
--   1. Pulse Network Telemetry Table (pulse_samples)
--   2. Analytics Aggregation Views (pulse_uptime_24h, pulse_gas_heatmap)
--   3. Downsampled History Stored Procedure (pulse_latency_series)
--   4. User Loyalty & Points System (verse_users)
--   5. Immutable Audit Activity Ledger for Airdrops (verse_activity_ledger)
--   6. Cross-Device Watchlist Cloud Sync (verse_watchlists)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Network Telemetry Foundation (VersePulse)
-- ------------------------------------------------------------------------------

create table if not exists public.pulse_samples (
  -- epoch milliseconds, used as the natural key so re-recorded samples dedupe
  t bigint primary key,
  recorded_at timestamptz not null default now(),
  -- highest block observed across all monitored RPCs for this sample
  highest_network_block bigint,
  gas_price_gwei numeric(20, 8),
  -- { "official": 142, "ankr": 311 }
  latencies jsonb not null default '{}'::jsonb,
  -- { "official": "healthy", "ankr": "degraded" }
  statuses jsonb not null default '{}'::jsonb,
  -- { "official": 0, "ankr": 10 } - blocks behind highest_network_block
  drifts jsonb not null default '{}'::jsonb
);

create index if not exists pulse_samples_t_desc_idx on public.pulse_samples (t desc);
create index if not exists pulse_samples_recorded_at_idx on public.pulse_samples (recorded_at desc);

alter table public.pulse_samples enable row level security;

-- Public read access for the dashboard (writes require the service role key).
drop policy if exists "pulse_samples_public_read" on public.pulse_samples;
create policy "pulse_samples_public_read"
  on public.pulse_samples
  for select
  to anon, authenticated
  using (true);

drop policy if exists "pulse_samples_service_write" on public.pulse_samples;
create policy "pulse_samples_service_write"
  on public.pulse_samples
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------------------------
-- 2. Network Analytics Views (pulse_uptime_24h & pulse_gas_heatmap)
-- ------------------------------------------------------------------------------

create or replace view public.pulse_uptime_24h
with (security_invoker = on) as
with windowed as (
  select
    t,
    latencies,
    statuses
  from public.pulse_samples
  where t >= (extract(epoch from now()) * 1000)::bigint - 86400000
),
rpc_ids as (
  select distinct jsonb_object_keys(latencies) as rpc_id
  from windowed
),
probes as (
  select
    rpc_ids.rpc_id,
    windowed.t,
    windowed.statuses ->> rpc_ids.rpc_id as status,
    case
      when (windowed.latencies ->> rpc_ids.rpc_id) ~ '^[0-9]+(\.[0-9]+)?$'
        then (windowed.latencies ->> rpc_ids.rpc_id)::numeric
    end as latency_ms
  from rpc_ids
  cross join windowed
)
select
  probes.rpc_id,
  (now() - interval '24 hours') as window_start,
  now() as window_end,
  count(*)::bigint as total_samples,
  count(probes.latency_ms)::bigint as successful_samples,
  (count(*) - count(probes.latency_ms))::bigint as failed_samples,
  round(100.0 * count(probes.latency_ms) / nullif(count(*), 0), 2) as uptime_pct,
  round(avg(probes.latency_ms), 2) as avg_latency_ms,
  round(
    (percentile_cont(0.95) within group (order by probes.latency_ms))::numeric,
    2
  ) as p95_latency_ms,
  round(min(probes.latency_ms))::integer as min_latency_ms,
  round(max(probes.latency_ms))::integer as max_latency_ms,
  count(*) filter (where probes.status = 'degraded')::bigint as degraded_samples,
  to_timestamp(
    (max(probes.t) filter (where probes.latency_ms is null) / 1000.0)::double precision
  ) as last_failure_at
from probes
group by probes.rpc_id
order by probes.rpc_id;

grant select on public.pulse_uptime_24h to anon, authenticated;

create or replace view public.pulse_gas_heatmap
with (security_invoker = on) as
with samples as (
  select
    (to_timestamp(t::double precision / 1000) at time zone 'UTC') as observed_at,
    gas_price_gwei
  from public.pulse_samples
  where gas_price_gwei is not null
    and gas_price_gwei > 0
)
select
  extract(isodow from samples.observed_at)::smallint as day_of_week,
  trim(to_char(samples.observed_at, 'Day')) as day_name,
  extract(hour from samples.observed_at)::smallint as hour_of_day,
  count(*)::bigint as sample_count,
  round(avg(samples.gas_price_gwei), 8) as avg_gas_price_gwei,
  round(min(samples.gas_price_gwei), 8) as min_gas_price_gwei,
  round(max(samples.gas_price_gwei), 8) as max_gas_price_gwei,
  round(coalesce(stddev_pop(samples.gas_price_gwei), 0), 8) as stddev_gas_price_gwei
from samples
group by 1, 2, 3
order by 1, 3;

grant select on public.pulse_gas_heatmap to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. Downsampling Stored Procedure (pulse_latency_series)
-- ------------------------------------------------------------------------------

create or replace function public.pulse_latency_series(range_key text default '24h')
returns table (
  bucket_start timestamptz,
  rpc_id text,
  avg_latency_ms numeric,
  min_latency_ms numeric,
  max_latency_ms numeric,
  samples bigint,
  successful_samples bigint,
  degraded_samples bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
with params as (
  select
    case range_key
      when '7d' then 604800000::bigint
      when '30d' then 2592000000::bigint
      else 86400000::bigint
    end as span_ms,
    case range_key
      when '7d' then 3600000::bigint
      when '30d' then 14400000::bigint
      else 300000::bigint
    end as bucket_ms
),
windowed as (
  select samples.t, samples.latencies, samples.statuses, params.bucket_ms
  from public.pulse_samples samples
  cross join params
  where samples.t >= (extract(epoch from now()) * 1000)::bigint - params.span_ms
),
rpc_ids as (
  select distinct jsonb_object_keys(windowed.latencies) as rpc_id
  from windowed
),
probes as (
  select
    (windowed.t / windowed.bucket_ms) * windowed.bucket_ms as bucket_ms_start,
    rpc_ids.rpc_id,
    windowed.statuses ->> rpc_ids.rpc_id as status,
    case
      when (windowed.latencies ->> rpc_ids.rpc_id) ~ '^[0-9]+(\.[0-9]+)?$'
        then (windowed.latencies ->> rpc_ids.rpc_id)::numeric
    end as latency_ms
  from rpc_ids
  cross join windowed
)
select
  to_timestamp((probes.bucket_ms_start / 1000.0)::double precision) as bucket_start,
  probes.rpc_id,
  round(avg(probes.latency_ms), 2) as avg_latency_ms,
  round(min(probes.latency_ms), 2) as min_latency_ms,
  round(max(probes.latency_ms), 2) as max_latency_ms,
  count(*)::bigint as samples,
  count(probes.latency_ms)::bigint as successful_samples,
  count(*) filter (where probes.status = 'degraded')::bigint as degraded_samples
from probes
group by probes.bucket_ms_start, probes.rpc_id
order by probes.bucket_ms_start, probes.rpc_id;
$$;

grant execute on function public.pulse_latency_series(text) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. User Loyalty & VersePoints System (verse_users)
-- ------------------------------------------------------------------------------

create table if not exists public.verse_users (
  -- wallet address strictly in lowercase EIP-55 format
  wallet_address text primary key,
  first_seen_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  total_points bigint not null default 0,
  swap_count integer not null default 0,
  swap_volume_etn numeric not null default 0,
  drop_batch_count integer not null default 0,
  drop_recipients_total integer not null default 0,
  revoke_count integer not null default 0,
  active_days_streak integer not null default 1,
  is_premium boolean not null default false
);

create index if not exists verse_users_total_points_idx on public.verse_users (total_points desc);
create index if not exists verse_users_last_active_idx on public.verse_users (last_active_at desc);

alter table public.verse_users enable row level security;

-- Public read access so leaderboards and profile cards can render seamlessly
drop policy if exists "verse_users_public_read" on public.verse_users;
create policy "verse_users_public_read"
  on public.verse_users
  for select
  to anon, authenticated
  using (true);

-- Service-role has full access for verified backend writes
drop policy if exists "verse_users_service_all" on public.verse_users;
create policy "verse_users_service_all"
  on public.verse_users
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------------------------
-- 5. Immutable Audit Activity Ledger for Airdrops (verse_activity_ledger)
-- ------------------------------------------------------------------------------

create table if not exists public.verse_activity_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.verse_users(wallet_address) on delete cascade,
  action_type text not null, -- 'PULSEDROP_BATCH', 'PULSESWAP_TRADE', 'REVOKE_APPROVAL', 'PORTFOLIO_SCAN', 'DAILY_CHECKIN'
  tx_hash text unique,        -- nullable for off-chain actions like check-in, UNIQUE to prevent double-crediting on-chain txs
  points_awarded integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists verse_activity_ledger_wallet_idx on public.verse_activity_ledger (wallet_address, created_at desc);
create index if not exists verse_activity_ledger_action_idx on public.verse_activity_ledger (action_type);
create index if not exists verse_activity_ledger_tx_hash_idx on public.verse_activity_ledger (tx_hash) where tx_hash is not null;

alter table public.verse_activity_ledger enable row level security;

-- Public audit read access
drop policy if exists "verse_activity_ledger_public_read" on public.verse_activity_ledger;
create policy "verse_activity_ledger_public_read"
  on public.verse_activity_ledger
  for select
  to anon, authenticated
  using (true);

drop policy if exists "verse_activity_ledger_service_all" on public.verse_activity_ledger;
create policy "verse_activity_ledger_service_all"
  on public.verse_activity_ledger
  for all
  to service_role
  using (true)
  with check (true);

-- ------------------------------------------------------------------------------
-- 6. Cross-Device Watchlist Cloud Sync (verse_watchlists)
-- ------------------------------------------------------------------------------

create table if not exists public.verse_watchlists (
  wallet_address text not null references public.verse_users(wallet_address) on delete cascade,
  watched_address text not null,
  label text not null,
  created_at timestamptz not null default now(),
  primary key (wallet_address, watched_address)
);

create index if not exists verse_watchlists_wallet_idx on public.verse_watchlists (wallet_address);

alter table public.verse_watchlists enable row level security;

drop policy if exists "verse_watchlists_public_read" on public.verse_watchlists;
create policy "verse_watchlists_public_read"
  on public.verse_watchlists
  for select
  to anon, authenticated
  using (true);

drop policy if exists "verse_watchlists_service_all" on public.verse_watchlists;
create policy "verse_watchlists_service_all"
  on public.verse_watchlists
  for all
  to service_role
  using (true)
  with check (true);
