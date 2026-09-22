-- ETN Pulse latency time-series.
--
-- Run this after schema.sql. It adds the downsampling function behind
-- `GET /api/analytics?range=24h|7d|30d`.
--
-- The dashboard asks for a window, not a row count, and the function picks the
-- bucket width that keeps the payload small: 30 days of 5s samples is ~518k
-- rows, which is ~360 aggregated points here instead.
--
--   range   span     bucket      points per rpc
--   24h     24 h     5 minutes   288
--   7d       7 d     1 hour      168
--   30d     30 d     4 hours     180
--
-- Averages ignore failed probes (a timed-out probe stores `null`, not 0), so a
-- bucket with no successful probe aggregates to null and the chart draws a gap
-- rather than a misleading dip to zero.

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
  -- t is epoch milliseconds; the index on t keeps this window cheap.
  where samples.t >= (extract(epoch from now()) * 1000)::bigint - params.span_ms
),
rpc_ids as (
  select distinct jsonb_object_keys(windowed.latencies) as rpc_id
  from windowed
),
probes as (
  select
    -- Epoch-aligned bucket start. 5 min / 1 h / 4 h all divide a UTC day
    -- evenly, so buckets land on :00 boundaries.
    (windowed.t / windowed.bucket_ms) * windowed.bucket_ms as bucket_ms_start,
    rpc_ids.rpc_id,
    windowed.statuses ->> rpc_ids.rpc_id as status,
    -- Guard the cast: one malformed value must not break the whole series.
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

comment on function public.pulse_latency_series(text) is
  'Per-RPC latency buckets for the dashboard chart: 5-minute over 24h, 1-hour over 7d, 4-hour over 30d.';

grant execute on function public.pulse_latency_series(text) to anon, authenticated;
