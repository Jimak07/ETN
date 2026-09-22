import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseConfig } from "./config.js";
import type { PulseSample, RpcStatus } from "./types.js";

export type HeadlessClient = SupabaseClient;

/**
 * Headless (server-side) Supabase client.
 *
 * Session persistence and token refresh are disabled because the worker is a
 * long-running process with no browser storage and no user context: it
 * authenticates once with the service role key and holds no state.
 */
export function createHeadlessClient({ url, serviceRoleKey }: SupabaseConfig): HeadlessClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-application-name": "etn-pulse-worker" },
    },
  });
}

/** Column names as they appear in `public.pulse_samples`. */
interface PulseRow {
  t: number;
  highest_network_block: number | null;
  gas_price_gwei: string | null;
  latencies: Record<string, number | null>;
  statuses: Record<string, RpcStatus>;
  drifts: Record<string, number | null>;
  wss_latency: number | null;
}

export function toRow(sample: PulseSample): PulseRow {
  return {
    t: sample.t,
    highest_network_block: sample.highestNetworkBlock,
    gas_price_gwei: sample.gasPriceGwei,
    latencies: sample.latencies,
    statuses: sample.statuses,
    drifts: sample.drifts,
    wss_latency: sample.wssLatency,
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Postgres numeric arrives as a string; keep it exact and trim zero padding. */
function normalizeDecimal(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "string" ? value : String(value);
  return raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
}

function toRecord<T>(value: unknown): Record<string, T> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};
}

export function fromRow(row: Record<string, unknown>): PulseSample {
  return {
    t: toNumber(row.t) ?? 0,
    highestNetworkBlock: toNumber(row.highest_network_block),
    gasPriceGwei: normalizeDecimal(row.gas_price_gwei),
    latencies: toRecord<number | null>(row.latencies),
    statuses: toRecord<RpcStatus>(row.statuses),
    drifts: toRecord<number | null>(row.drifts),
    wssLatency: toNumber(row.wss_latency),
  };
}

/**
 * Persists one sample.
 *
 * `upsert` with `ignoreDuplicates` keyed on `t` makes the write idempotent: if
 * a cycle is replayed (manual `--once`, a restarted process, an overlapping
 * deploy) the existing row wins instead of raising a primary-key conflict.
 */
export async function insertSample(
  client: HeadlessClient,
  table: string,
  sample: PulseSample,
): Promise<void> {
  const { error } = await client
    .from(table)
    .upsert(toRow(sample), { onConflict: "t", ignoreDuplicates: true });

  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
}

/** Reads the newest N samples, oldest first — the shape the dashboard expects. */
export async function fetchRecentSamples(
  client: HeadlessClient,
  table: string,
  limit: number,
): Promise<PulseSample[]> {
  const { data, error } = await client
    .from(table)
    .select("t,highest_network_block,gas_price_gwei,latencies,statuses,drifts,wss_latency")
    .order("t", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Supabase select failed: ${error.message}`);

  return (data ?? [])
    .map((row) => fromRow(row as Record<string, unknown>))
    .reverse();
}
