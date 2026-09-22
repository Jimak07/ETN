import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import {
  DEFAULT_HISTORY_RANGE,
  NO_FAILURES,
  RANGE_META,
  isHistoryRange,
  type AnalyticsResponse,
  type AnalyticsFailures,
  type GasExtreme,
  type GasHeatmapCell,
  type HistoryRange,
  type LatencyBucketValue,
  type LatencyHistory,
  type LatencyHistoryPoint,
  type RpcUptime,
} from "@/lib/analytics";
import { ETN_CHAIN_ID } from "@/lib/etn";

/**
 * GET /api/analytics?range=24h|7d|30d
 *
 * Reads the two aggregate views created by `supabase/02_analytics_views.sql`:
 *
 *   pulse_uptime_24h  -> per-RPC uptime (successful latency vs timeout)
 *   pulse_gas_heatmap -> average gas price per UTC day-of-week/hour bucket
 *
 * plus the downsampled chart series from `pulse_latency_series(range)`, created
 * by `supabase/03_latency_series.sql`. `range` only affects that series — the
 * two views are window-independent — and defaults to 24h.
 *
 * All three reads run concurrently and independently: a broken heatmap view
 * still returns uptime data and history, with the failure reported in `errors`.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const UPTIME_VIEW = "pulse_uptime_24h";
const HEATMAP_VIEW = "pulse_gas_heatmap";
const SERIES_FUNCTION = "pulse_latency_series";

/** Ceiling for a single PostgREST round trip, so a stalled DB cannot hang the route. */
const QUERY_TIMEOUT_MS = 8000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const NO_STORE = "no-store, no-cache, must-revalidate, max-age=0";

/* -------------------------------------------------------------------------- *
 * Response types
 * -------------------------------------------------------------------------- */

/**
 * The payload shape is declared once in `lib/analytics.ts` and imported here,
 * so the server response and the dashboard's parser cannot drift apart. It is
 * re-exported because this route remains the documented home of its contract.
 */
export type {
  AnalyticsResponse,
  AnalyticsFailures,
  GasExtreme,
  GasHeatmapCell,
  HistoryRange,
  LatencyHistory,
  RpcUptime,
};

/* -------------------------------------------------------------------------- *
 * Supabase client
 * -------------------------------------------------------------------------- */

interface SupabaseEnv {
  url: string;
  key: string;
}

/**
 * Resolves credentials for a read-only analytics endpoint.
 *
 * The anon key is preferred — the views are executed with `security_invoker`
 * against the public-read policy, so no elevated privilege is needed and a
 * leaked key cannot write. The service role key is only a fallback for stricter
 * RLS setups.
 */
function readSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;
  return { url, key };
}

let cachedClient: { key: string; client: SupabaseClient } | null = null;

function getClient(env: SupabaseEnv): SupabaseClient {
  const cacheKey = `${env.url}:${env.key}`;
  if (cachedClient?.key === cacheKey) return cachedClient.client;

  const client = createClient(env.url, env.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-application-name": "etn-pulse-analytics" },
    },
  });

  cachedClient = { key: cacheKey, client };
  return client;
}

/* -------------------------------------------------------------------------- *
 * Row mapping (snake_case view columns -> typed camelCase)
 * -------------------------------------------------------------------------- */

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Postgres numeric arrives as a string; keep it exact and trim zero padding. */
function toDecimalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "string" ? value : String(value);
  return raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
}

function toIsoString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toRpcUptime(row: Record<string, unknown>): RpcUptime {
  return {
    rpcId: typeof row.rpc_id === "string" ? row.rpc_id : "unknown",
    windowStart: toIsoString(row.window_start),
    windowEnd: toIsoString(row.window_end),
    totalSamples: toNumber(row.total_samples) ?? 0,
    successfulSamples: toNumber(row.successful_samples) ?? 0,
    failedSamples: toNumber(row.failed_samples) ?? 0,
    uptimePct: toNumber(row.uptime_pct),
    avgLatencyMs: toNumber(row.avg_latency_ms),
    p95LatencyMs: toNumber(row.p95_latency_ms),
    minLatencyMs: toNumber(row.min_latency_ms),
    maxLatencyMs: toNumber(row.max_latency_ms),
    degradedSamples: toNumber(row.degraded_samples) ?? 0,
    lastFailureAt: toIsoString(row.last_failure_at),
  };
}

function toHeatmapCell(row: Record<string, unknown>): GasHeatmapCell {
  const dayOfWeek = toNumber(row.day_of_week) ?? 0;
  const hourOfDay = toNumber(row.hour_of_day) ?? 0;
  const dayName = typeof row.day_name === "string" ? row.day_name : `Day ${dayOfWeek}`;

  return {
    dayOfWeek,
    dayName,
    hourOfDay,
    label: `${dayName} ${String(hourOfDay).padStart(2, "0")}:00`,
    sampleCount: toNumber(row.sample_count) ?? 0,
    avgGasPriceGwei: toDecimalString(row.avg_gas_price_gwei),
    minGasPriceGwei: toDecimalString(row.min_gas_price_gwei),
    maxGasPriceGwei: toDecimalString(row.max_gas_price_gwei),
    stddevGasPriceGwei: toDecimalString(row.stddev_gas_price_gwei),
  };
}

/**
 * 42P01 is Postgres' "undefined table"; PostgREST reports a missing relation as
 * PGRST205 and a missing function as PGRST202.
 */
const MISSING_OBJECT_CODES = new Set(["42P01", "PGRST205", "PGRST202"]);
const MISSING_OBJECT_PATTERN =
  /does not exist|could not find the (table|function)|schema cache/i;

function describeQueryError(
  label: string,
  error: { message: string; code?: string },
  migration: string,
): string {
  const missing =
    (error.code !== undefined && MISSING_OBJECT_CODES.has(error.code)) ||
    MISSING_OBJECT_PATTERN.test(error.message);

  if (missing) {
    return `${label} is missing — run supabase/${migration} in the Supabase SQL editor`;
  }
  return `${label}: ${error.message}`;
}

/* -------------------------------------------------------------------------- *
 * Queries
 * -------------------------------------------------------------------------- */

async function fetchUptime(client: SupabaseClient): Promise<RpcUptime[]> {
  const { data, error } = await client
    .from(UPTIME_VIEW)
    .select("*")
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  if (error) throw new Error(describeQueryError(UPTIME_VIEW, error, "02_analytics_views.sql"));
  return (data ?? []).map((row) => toRpcUptime(row as Record<string, unknown>));
}

async function fetchGasHeatmap(client: SupabaseClient): Promise<GasHeatmapCell[]> {
  const { data, error } = await client
    .from(HEATMAP_VIEW)
    .select("*")
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  if (error) throw new Error(describeQueryError(HEATMAP_VIEW, error, "02_analytics_views.sql"));
  return (data ?? []).map((row) => toHeatmapCell(row as Record<string, unknown>));
}

/** Raw shape of one `pulse_latency_series` row (long format: bucket x rpc). */
interface LatencySeriesRow {
  bucket_start: string;
  rpc_id: string;
  avg_latency_ms: number | string | null;
  min_latency_ms: number | string | null;
  max_latency_ms: number | string | null;
  samples: number | string | null;
  successful_samples: number | string | null;
  degraded_samples: number | string | null;
}

/**
 * Fold the function's long (bucket, rpc) rows into one point per bucket, which
 * is the shape the chart consumes. Downsampling already happened in Postgres,
 * so this is a pivot over a few hundred rows, not a scan.
 */
function pivotLatencySeries(
  rows: readonly unknown[],
): LatencyHistoryPoint[] {
  const byBucket = new Map<number, LatencyHistoryPoint>();

  for (const raw of rows) {
    const row = raw as LatencySeriesRow;
    const t = Date.parse(row.bucket_start);
    if (!Number.isFinite(t) || typeof row.rpc_id !== "string") continue;

    let point = byBucket.get(t);
    if (!point) {
      point = { t, values: {} };
      byBucket.set(t, point);
    }

    const value: LatencyBucketValue = {
      avgMs: toNumber(row.avg_latency_ms),
      minMs: toNumber(row.min_latency_ms),
      maxMs: toNumber(row.max_latency_ms),
      samples: toNumber(row.samples) ?? 0,
      successfulSamples: toNumber(row.successful_samples) ?? 0,
      degradedSamples: toNumber(row.degraded_samples) ?? 0,
    };

    point.values[row.rpc_id] = value;
  }

  return [...byBucket.values()].sort((a, b) => a.t - b.t);
}

async function fetchLatencySeries(
  client: SupabaseClient,
  range: HistoryRange,
): Promise<LatencyHistory> {
  const { data, error } = await client
    .rpc(SERIES_FUNCTION, { range_key: range })
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  if (error) {
    throw new Error(describeQueryError(SERIES_FUNCTION, error, "03_latency_series.sql"));
  }

  return {
    range,
    bucketSeconds: RANGE_META[range].bucketSeconds,
    points: pivotLatencySeries(data ?? []),
  };
}

function findExtremes(cells: readonly GasHeatmapCell[]): AnalyticsResponse["extremes"] {
  const priced = cells.filter((cell) => toNumber(cell.avgGasPriceGwei) !== null);
  if (priced.length === 0) return { cheapest: null, priciest: null };

  const toExtreme = (cell: GasHeatmapCell): GasExtreme => ({
    label: cell.label,
    dayOfWeek: cell.dayOfWeek,
    hourOfDay: cell.hourOfDay,
    avgGasPriceGwei: cell.avgGasPriceGwei,
  });

  let cheapest = priced[0];
  let priciest = priced[0];
  for (const cell of priced) {
    const price = toNumber(cell.avgGasPriceGwei) ?? 0;
    if (price < (toNumber(cheapest.avgGasPriceGwei) ?? Number.POSITIVE_INFINITY)) cheapest = cell;
    if (price > (toNumber(priciest.avgGasPriceGwei) ?? Number.NEGATIVE_INFINITY)) priciest = cell;
  }

  return { cheapest: toExtreme(cheapest), priciest: toExtreme(priciest) };
}

/* -------------------------------------------------------------------------- *
 * Handler
 * -------------------------------------------------------------------------- */

function respond(payload: AnalyticsResponse, status: number) {
  return NextResponse.json(payload, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Cache-Control": NO_STORE,
      "X-Analytics-Ok": String(payload.ok),
      "X-Analytics-Range": payload.latencyHistory?.range ?? DEFAULT_HISTORY_RANGE,
    },
  });
}

/**
 * Read the chart window from `?range=`.
 *
 * The parameter only selects a bucket width inside `pulse_latency_series`, so
 * an absent or unrecognised value is not an error — it falls back to the
 * default window rather than 400-ing the dashboard's only analytics read.
 */
function readRange(request: Request): HistoryRange {
  const requested = new URL(request.url).searchParams.get("range");
  return requested !== null && isHistoryRange(requested) ? requested : DEFAULT_HISTORY_RANGE;
}

export async function GET(request: Request) {
  const range = readRange(request);
  const checkedAt = new Date().toISOString();
  const env = readSupabaseEnv();

  // No credentials is a deployment state, not a runtime failure: answer with a
  // valid envelope so the dashboard can render a "connect Supabase" empty state.
  if (!env) {
    return respond(
      {
        ok: false,
        configured: false,
        checkedAt,
        chainId: ETN_CHAIN_ID,
        timezone: "UTC",
        uptime: [],
        gasHeatmap: [],
        latencyHistory: null,
        failures: NO_FAILURES,
        extremes: { cheapest: null, priciest: null },
        errors: [
          "Supabase is not configured — set SUPABASE_URL and SUPABASE_ANON_KEY in the environment, then run supabase/schema.sql, supabase/02_analytics_views.sql and supabase/03_latency_series.sql",
        ],
      },
      200,
    );
  }

  try {
    const client = getClient(env);

    // Independent reads: a broken view degrades rather than blanks the payload.
    const [uptimeResult, heatmapResult, seriesResult] = await Promise.allSettled([
      fetchUptime(client),
      fetchGasHeatmap(client),
      fetchLatencySeries(client, range),
    ]);

    // Each query owns a slot, so a failure is blamed on the card that will
    // actually be missing data and not on its neighbours.
    const failures: AnalyticsFailures = { ...NO_FAILURES };
    let uptime: RpcUptime[] = [];
    let gasHeatmap: GasHeatmapCell[] = [];
    let latencyHistory: LatencyHistory | null = null;

    if (uptimeResult.status === "fulfilled") {
      uptime = uptimeResult.value;
    } else {
      failures.uptime = describeError(uptimeResult.reason);
    }

    if (heatmapResult.status === "fulfilled") {
      gasHeatmap = heatmapResult.value;
    } else {
      failures.gasHeatmap = describeError(heatmapResult.reason);
    }

    if (seriesResult.status === "fulfilled") {
      latencyHistory = seriesResult.value;
    } else {
      failures.latencyHistory = describeError(seriesResult.reason);
    }

    const errors = Object.values(failures).filter((message): message is string => message !== null);
    const ok = errors.length === 0;

    return respond(
      {
        ok,
        configured: true,
        checkedAt,
        chainId: ETN_CHAIN_ID,
        timezone: "UTC",
        uptime,
        gasHeatmap,
        latencyHistory,
        failures,
        extremes: findExtremes(gasHeatmap),
        errors,
      },
      ok ? 200 : 503,
    );
  } catch (error) {
    // The handler itself threw: nothing in this response is trustworthy, so
    // every card gets the same explanation.
    const detail = describeError(error);
    return respond(
      {
        ok: false,
        configured: true,
        checkedAt,
        chainId: ETN_CHAIN_ID,
        timezone: "UTC",
        uptime: [],
        gasHeatmap: [],
        latencyHistory: null,
        failures: { uptime: detail, gasHeatmap: detail, latencyHistory: detail },
        extremes: { cheapest: null, priciest: null },
        errors: [detail],
      },
      503,
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS } });
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === "TimeoutError" || error.name === "AbortError"
      ? `Analytics query did not answer within ${QUERY_TIMEOUT_MS / 1000}s`
      : error.message;
  }
  return typeof error === "string" ? error : "Unknown analytics error";
}
