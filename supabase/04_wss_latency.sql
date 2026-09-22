-- ETN Pulse WebSocket (WSS) stream metrics.
--
-- Run this after 03_latency_series.sql. It stores the measurement produced by
-- the `newHeads` subscription in backend/src/wss.ts.
--
-- wss_latency is the WebSocket stream's *head start* over the HTTP poll, in
-- milliseconds, for the same block height:
--
--   wss_latency = httpObservedAt - wssObservedAt
--
-- A positive number means the stream saw the tip before the 5-second HTTP probe
-- did; a negative number means the stream was behind the HTTP read, which is
-- expected for one cycle after a reconnect. NULL means the value could not be
-- measured for that sample: the stream is disabled or down, the HTTP nodes
-- never reported the height the stream saw, or the two sightings were more than
-- one poll interval apart - at that distance the number says more about when
-- the chain produced the block than about transport speed.

alter table public.pulse_samples
  add column if not exists wss_latency integer;

comment on column public.pulse_samples.wss_latency is
  'WebSocket head start in ms (httpObservedAt - wssObservedAt for the same height). NULL when the stream is down or the delta exceeds one poll interval.';
