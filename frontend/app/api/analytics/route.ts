import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import type { AnalyticsResponse, GasExtreme, GasHeatmapCell, RpcUptime } from "@/lib/analytics";
import { ETN_CHAIN_ID } from "@/lib/etn";

/**
 * GET /api/analytics
 *
 * Reads the two aggregate views created by `supabase/02_analytics_views.sql`:
 *
 *   pulse_uptime_24h  -> per-RPC uptime (successful latency vs timeout)
 *   pulse_gas_heatmap -> average gas price per UTC day-of-week/hour bucket
 *
 * Both reads run concurrently and independently: a broken heatmap view still
 * returns uptime data, with the failure reported in `errors`.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const UPTIME_VIEW = "pulse_uptime_24h";
const HEATMAP_VIEW = "pulse_gas_heatmap";

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
export type { AnalyticsResponse, GasExtreme, GasHeatmapCell, RpcUptime };

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

/** 42P01 is Postgres' "undefined table"; PostgREST reports the same as PGRST205. */
const MISSING_VIEW_CODES = new Set(["42P01", "PGRST205"]);
const MISSING_VIEW_PATTERN = /does not exist|could not find the table|schema cache/i;

function describeQueryError(view: string, error: { message: string; code?: string }): string {
  const missing =
    (error.code !== undefined && MISSING_VIEW_CODES.has(error.code)) ||
    MISSING_VIEW_PATTERN.test(error.message);

  if (missing) {
    return `${view} is missing — run supabase/02_analytics_views.sql in the Supabase SQL editor`;
  }
  return `${view}: ${error.message}`;
}

/* -------------------------------------------------------------------------- *
 * Queries
 * -------------------------------------------------------------------------- */

async function fetchUptime(client: SupabaseClient): Promise<RpcUptime[]> {
  const { data, error } = await client
    .from(UPTIME_VIEW)
    .select("*")
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  if (error) throw new Error(describeQueryError(UPTIME_VIEW, error));
  return (data ?? []).map((row) => toRpcUptime(row as Record<string, unknown>));
}

async function fetchGasHeatmap(client: SupabaseClient): Promise<GasHeatmapCell[]> {
  const { data, error } = await client
    .from(HEATMAP_VIEW)
    .select("*")
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  if (error) throw new Error(describeQueryError(HEATMAP_VIEW, error));
  return (data ?? []).map((row) => toHeatmapCell(row as Record<string, unknown>));
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
    },
  });
}

export async function GET() {
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
        extremes: { cheapest: null, priciest: null },
        errors: [
          "Supabase is not configured — set SUPABASE_URL and SUPABASE_ANON_KEY in the environment, then run supabase/schema.sql and supabase/02_analytics_views.sql",
        ],
      },
      200,
    );
  }

  try {
    const client = getClient(env);

    // Independent reads: a broken view degrades rather than blanks the payload.
    const [uptimeResult, heatmapResult] = await Promise.allSettled([
      fetchUptime(client),
      fetchGasHeatmap(client),
    ]);

    const errors: string[] = [];
    let uptime: RpcUptime[] = [];
    let gasHeatmap: GasHeatmapCell[] = [];

    if (uptimeResult.status === "fulfilled") {
      uptime = uptimeResult.value;
    } else {
      errors.push(describeError(uptimeResult.reason));
    }

    if (heatmapResult.status === "fulfilled") {
      gasHeatmap = heatmapResult.value;
    } else {
      errors.push(describeError(heatmapResult.reason));
    }

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
        extremes: findExtremes(gasHeatmap),
        errors,
      },
      ok ? 200 : 503,
    );
  } catch (error) {
    return respond(
      {
        ok: false,
        configured: true,
        checkedAt,
        chainId: ETN_CHAIN_ID,
        timezone: "UTC",
        uptime: [],
        gasHeatmap: [],
        extremes: { cheapest: null, priciest: null },
        errors: [describeError(error)],
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
