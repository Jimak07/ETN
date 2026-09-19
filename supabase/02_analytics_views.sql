-- ETN Pulse analytics views.
--
-- Run this after schema.sql in the Supabase SQL editor. Both views read
-- `public.pulse_samples`; neither stores data of its own.
--
-- They are created with `security_invoker = on` (PostgreSQL 15+, which is what
-- Supabase runs) so they obey the caller's row level security rather than the
-- view owner's privileges. Without it a view would silently bypass the RLS
-- policy on the underlying table.

-- --------------------------------------------------------------------------
-- pulse_uptime_24h
--
-- One row per monitored RPC covering the trailing 24 hours:
--   * `successful_samples` = probes that returned a latency (`latencies->>id`
--     is not null, i.e. not a timeout / offline probe)
--   * `failed_samples`     = everything else
--   * `uptime_pct`         = successful / total * 100
--
-- The RPC ids are discovered from the JSONB keys rather than hard-coded, so a
-- third endpoint shows up here automatically once the engine reports it.
-- --------------------------------------------------------------------------

create or replace view public.pulse_uptime_24h
with (security_invoker = on) as
with windowed as (
  select
    t,
    latencies,
    statuses
  from public.pulse_samples
  -- t is epoch milliseconds; the index on t keeps this window cheap.
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
    -- Guard the cast: a single malformed value must not make the whole view
    -- error out, so only numeric-looking text is treated as a latency.
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
  -- percentile_cont returns double precision, and round(double precision, int)
  -- does not exist, so cast to numeric before rounding.
  round(
    (percentile_cont(0.95) within group (order by probes.latency_ms))::numeric,
    2
  ) as p95_latency_ms,
  round(min(probes.latency_ms))::integer as min_latency_ms,
  round(max(probes.latency_ms))::integer as max_latency_ms,
  count(*) filter (where probes.status = 'degraded')::bigint as degraded_samples,
  -- t is epoch milliseconds; the explicit cast keeps to_timestamp(double
  -- precision) unambiguous rather than relying on a numeric promotion.
  to_timestamp(
    (max(probes.t) filter (where probes.latency_ms is null) / 1000.0)::double precision
  ) as last_failure_at
from probes
group by probes.rpc_id
order by probes.rpc_id;

comment on view public.pulse_uptime_24h is
  'Per-RPC uptime over the trailing 24h: successful (latency not null) vs failed (timeout/offline) probes.';

grant select on public.pulse_uptime_24h to anon, authenticated;

-- --------------------------------------------------------------------------
-- pulse_gas_heatmap
--
-- Average gas price per (day of week, hour of day) bucket, for finding when
-- the network is cheapest to transact.
--
-- Buckets are computed in UTC. To read them in another zone, replace
-- `at time zone 'UTC'` below with e.g. `at time zone 'Africa/Lagos'` and
-- update the timezone the API reports.
-- --------------------------------------------------------------------------

create or replace view public.pulse_gas_heatmap
with (security_invoker = on) as
with samples as (
  select
    -- t is epoch milliseconds -> timestamptz -> UTC wall clock
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

comment on view public.pulse_gas_heatmap is
  'Average gas price per UTC day-of-week/hour bucket (ISO day 1 = Monday), for cheapest-window analysis.';

grant select on public.pulse_gas_heatmap to anon, authenticated;
