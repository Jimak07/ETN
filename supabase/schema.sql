-- ETN Pulse historical logging schema.
--
-- Run this in the Supabase SQL editor, then set SUPABASE_URL and
-- SUPABASE_SERVICE_ROLE_KEY in .env.local. The pulse engine detects both
-- variables and switches from its in-memory ring buffer to this table.

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

-- The dashboard only ever reads the newest N samples.
create index if not exists pulse_samples_recorded_at_idx on public.pulse_samples (recorded_at desc);

alter table public.pulse_samples enable row level security;

-- Public read access for the dashboard (writes require the service role key).
drop policy if exists "pulse_samples_public_read" on public.pulse_samples;
create policy "pulse_samples_public_read"
  on public.pulse_samples
  for select
  to anon, authenticated
  using (true);

-- Optional: keep the table small with a rolling retention job.
-- select cron.schedule('pulse-retention', '0 * * * *', $$
--   delete from public.pulse_samples where t < (extract(epoch from now()) * 1000)::bigint - 86400000;
-- $$);
