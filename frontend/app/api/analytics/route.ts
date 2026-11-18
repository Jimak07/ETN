import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getAddress, isAddress, type Hash } from "viem";

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
import { ETN_CHAIN_ID, MONITORED_RPCS } from "@/lib/etn";
import { getRpcClient } from "@/lib/etn-chain";
import {
  getSupabaseConfig,
  getSupabaseServerClient,
  inMemoryVerseStore,
  type VerseUser,
  type VerseActivity,
} from "@/lib/supabase/server";

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
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
} as const;

const NO_STORE = "no-store, no-cache, must-revalidate, max-age=0";

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
 * Supabase Telemetry Client (Reuses shared helper from lib/supabase/server.ts)
 * -------------------------------------------------------------------------- */

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

const MISSING_OBJECT_CODES = new Set(["42P01", "42883", "PGRST204", "PGRST205"]);
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

  return Array.from(byBucket.values()).sort((a, b) => a.t - b.t);
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

function readRange(request: Request): HistoryRange {
  const requested = new URL(request.url).searchParams.get("range");
  return requested !== null && isHistoryRange(requested) ? requested : DEFAULT_HISTORY_RANGE;
}

const KNOWN_PULSEDROP_TARGETS = new Set(
  [
    "0x369d2fe65976311d6bf2e30a9652a4fd275866d0",
    "0x369d2fe03ae03915d7a48d58daf0dcd8207245cf",
    (process.env.NEXT_PUBLIC_MULTISENDER_ADDRESS ?? "").toLowerCase(),
    (process.env.NEXT_PUBLIC_MULTISENDER_TESTNET ?? "").toLowerCase(),
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase())
);

const KNOWN_ROUTER_TARGETS = new Set([
  "0x072d4706f9a383d5608bd14b09b41683cb95ffd7", // ElectroSwap V2 Router
  "0x5a3ab7e9f405250b36e7e0a4654c1052eadc1f07", // ElectroSwap SwapRouter02
]);

interface BlockscoutTxItem {
  hash?: string;
  status?: string | null;
  result?: string | null;
  timestamp?: string | null;
  to?: { hash?: string } | null;
  from?: { hash?: string } | null;
  method?: string | null;
}

/**
 * Scans Blockscout for confirmed past transactions sent by the user to our
 * PulseDrop or ElectroSwap contracts and backfills them into Supabase.
 */
async function backfillUserOnChainActivity(
  walletAddress: string,
  supabase: SupabaseClient | null,
  existingUser: VerseUser | null
): Promise<{ backfilledDrops: number; backfilledSwaps: number; pointsAdded: number }> {
  const normalized = walletAddress.toLowerCase();
  let backfilledDrops = 0;
  let backfilledSwaps = 0;
  let pointsAdded = 0;

  try {
    const res = await fetch(
      `https://blockexplorer.electroneum.com/api/v2/addresses/${normalized}/transactions?limit=50`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!res.ok) return { backfilledDrops, backfilledSwaps, pointsAdded };
    const data = (await res.json()) as { items?: BlockscoutTxItem[] };
    const items = data.items || [];

    for (const tx of items) {
      if (!tx || !tx.hash || typeof tx.hash !== "string") continue;
      const txHashLower = tx.hash.toLowerCase();
      const isSuccess = tx.status === "ok" || tx.result === "success" || tx.status === null;
      if (!isSuccess) continue;

      const fromHash = tx.from?.hash?.toLowerCase();
      if (fromHash !== normalized) continue;

      const toHash = tx.to?.hash?.toLowerCase() || "";
      const isPulseDrop =
        KNOWN_PULSEDROP_TARGETS.has(toHash) || toHash.startsWith("0x369d2fe");
      const isSwap = KNOWN_ROUTER_TARGETS.has(toHash);

      if (!isPulseDrop && !isSwap) continue;

      // Check if already credited
      let alreadyRecorded = false;
      if (supabase) {
        const { data: existingLedger } = await supabase
          .from("verse_activity_ledger")
          .select("id")
          .eq("tx_hash", txHashLower)
          .maybeSingle();
        if (existingLedger) alreadyRecorded = true;
      }
      if (inMemoryVerseStore.hasTxHash(txHashLower)) {
        alreadyRecorded = true;
      }

      if (alreadyRecorded) continue;

      const actionType = isPulseDrop ? "PULSEDROP_BATCH" : "PULSESWAP_TRADE";
      const pts = isPulseDrop ? 100 : 50;
      const txTime = tx.timestamp || new Date().toISOString();

      if (supabase) {
        await supabase.from("verse_activity_ledger").insert({
          wallet_address: normalized,
          action_type: actionType,
          tx_hash: txHashLower,
          points_awarded: pts,
          metadata: {
            backfilled: true,
            method: tx.method || null,
            targetContract: toHash,
          },
          created_at: txTime,
        });
      }

      inMemoryVerseStore.recordActivity(
        normalized,
        actionType,
        pts,
        txHashLower,
        { backfilled: true, targetContract: toHash }
      );

      if (isPulseDrop) backfilledDrops += 1;
      if (isSwap) backfilledSwaps += 1;
      pointsAdded += pts;
    }

    if (pointsAdded > 0 && supabase) {
      const nowIso = new Date().toISOString();
      const updatedPoints = (Number(existingUser?.total_points) || 0) + pointsAdded;
      const updatedDrops = (existingUser?.drop_batch_count || 0) + backfilledDrops;
      const updatedSwaps = (existingUser?.swap_count || 0) + backfilledSwaps;

      await supabase.from("verse_users").upsert(
        {
          wallet_address: normalized,
          first_seen_at: existingUser ? existingUser.first_seen_at : nowIso,
          last_active_at: nowIso,
          total_points: updatedPoints,
          drop_batch_count: updatedDrops,
          swap_count: updatedSwaps,
          active_days_streak: existingUser?.active_days_streak || 1,
          is_premium: existingUser?.is_premium || false,
        },
        { onConflict: "wallet_address" }
      );
    }
  } catch (err) {
    console.warn("[backfillUserOnChainActivity] non-fatal backfill check failed:", err);
  }

  return { backfilledDrops, backfilledSwaps, pointsAdded };
}

/* -------------------------------------------------------------------------- *
 * HTTP Handlers
 * -------------------------------------------------------------------------- */

export async function GET(request: Request) {
  const url = new URL(request.url);

  // --------------------------------------------------------------------------
  // 0. Diagnostic Health Check (?health=true)
  // --------------------------------------------------------------------------
  if (url.searchParams.get("health") === "true") {
    const config = getSupabaseConfig();
    const supabase = getSupabaseServerClient();

    if (!config || !supabase) {
      return NextResponse.json(
        {
          supabaseConfigured: false,
          connectedToCloud: false,
          error:
            "Supabase environment variables (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are missing in frontend environment.",
        },
        { status: 503, headers: CORS_HEADERS }
      );
    }

    try {
      // Test read
      const { data: readData, error: readError } = await supabase
        .from("verse_users")
        .select("wallet_address")
        .limit(1);

      if (readError) {
        return NextResponse.json(
          {
            supabaseConfigured: true,
            connectedToCloud: false,
            error: `Read check failed: [${readError.code}] ${readError.message}`,
            details: readError.details,
          },
          { status: 500, headers: CORS_HEADERS }
        );
      }

      // Test write/upsert with a health-check sentinel address
      const testAddr = "0x0000000000000000000000000000000000000000";
      const now = new Date().toISOString();
      const { error: upsertError } = await supabase.from("verse_users").upsert(
        {
          wallet_address: testAddr,
          first_seen_at: now,
          last_active_at: now,
          total_points: 0,
          active_days_streak: 1,
          is_premium: false,
        },
        { onConflict: "wallet_address" }
      );

      if (upsertError) {
        return NextResponse.json(
          {
            supabaseConfigured: true,
            connectedToCloud: false,
            error: `Write check failed (RLS or permissions): [${upsertError.code}] ${upsertError.message}`,
            details: upsertError.details,
          },
          { status: 500, headers: CORS_HEADERS }
        );
      }

      // Clean up sentinel address
      await supabase.from("verse_users").delete().eq("wallet_address", testAddr);

      return NextResponse.json(
        {
          supabaseConfigured: true,
          connectedToCloud: true,
          url: config.url,
          tablesVerified: ["verse_users", "verse_activity_ledger", "verse_watchlists"],
        },
        { status: 200, headers: CORS_HEADERS }
      );
    } catch (err) {
      return NextResponse.json(
        {
          supabaseConfigured: true,
          connectedToCloud: false,
          error: err instanceof Error ? err.message : String(err),
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }
  }

  // --------------------------------------------------------------------------
  // 1. Airdrop Snapshot Exporter (?export=airdrop&pool=100000)
  // --------------------------------------------------------------------------
  if (url.searchParams.get("export") === "airdrop") {
    const expectedKey = process.env.AIRDROP_ADMIN_KEY;
    const providedKey =
      url.searchParams.get("adminKey") || request.headers.get("x-admin-key");
    if (expectedKey && providedKey !== expectedKey) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing admin key." },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    const pool = Math.max(1, Number(url.searchParams.get("pool")) || 100_000);
    const minPoints = Math.max(1, Number(url.searchParams.get("minPoints")) || 1);

    const supabase = getSupabaseServerClient();
    let eligibleUsers: Array<{ wallet_address: string; total_points: number }> = [];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("verse_users")
          .select("wallet_address, total_points")
          .gte("total_points", minPoints)
          .order("total_points", { ascending: false });

        if (!error && Array.isArray(data)) {
          eligibleUsers = data.map((d) => ({
            wallet_address: d.wallet_address,
            total_points: Number(d.total_points) || 0,
          }));
        }
      } catch (err) {
        console.error("Supabase airdrop query error:", err);
      }
    }

    // Fall back to in-memory store if database empty or unconfigured
    if (eligibleUsers.length === 0) {
      eligibleUsers = inMemoryVerseStore
        .getLeaderboard(1000)
        .filter((u) => u.total_points >= minPoints)
        .map((u) => ({
          wallet_address: u.wallet_address,
          total_points: u.total_points,
        }));
    }

    if (eligibleUsers.length === 0) {
      const csvContent = "address,amount\n# No eligible users with points found yet.\n";
      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="pulsedrop_airdrop_empty_${Date.now()}.csv"`,
        },
      });
    }

    const totalPointsSum = eligibleUsers.reduce((acc, u) => acc + u.total_points, 0);

    // Format ready-to-upload PulseDrop CSV
    const csvRows = ["address,amount"];
    for (const u of eligibleUsers) {
      const share = totalPointsSum > 0 ? (u.total_points / totalPointsSum) * pool : 0;
      const formattedAmount = Number(share.toFixed(4));
      try {
        const checksum = getAddress(u.wallet_address);
        csvRows.push(`${checksum},${formattedAmount}`);
      } catch {
        csvRows.push(`${u.wallet_address},${formattedAmount}`);
      }
    }

    const csvOutput = csvRows.join("\n");
    return new NextResponse(csvOutput, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="pulsedrop_airdrop_pool_${pool}_${Date.now()}.csv"`,
      },
    });
  }

  // --------------------------------------------------------------------------
  // 2. User Stats & VersePoints Profile (?address=0x...)
  // --------------------------------------------------------------------------
  const addressParam = url.searchParams.get("address");
  if (addressParam) {
    if (!isAddress(addressParam, { strict: false })) {
      return NextResponse.json(
        { error: "Invalid wallet address format." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const normalized = addressParam.toLowerCase();
    const supabase = getSupabaseServerClient();

    let user: VerseUser | null = null;
    let activities: VerseActivity[] = [];
    let watchlist: Array<{ address: string; label: string }> = [];

    if (supabase) {
      try {
        const [userRes, actRes, watchRes] = await Promise.allSettled([
          supabase.from("verse_users").select("*").eq("wallet_address", normalized).maybeSingle(),
          supabase.from("verse_activity_ledger").select("*").eq("wallet_address", normalized).order("created_at", { ascending: false }).limit(20),
          supabase.from("verse_watchlists").select("*").eq("wallet_address", normalized),
        ]);

        if (userRes.status === "fulfilled" && userRes.value.data) {
          user = userRes.value.data as VerseUser;
        }
        if (actRes.status === "fulfilled" && Array.isArray(actRes.value.data)) {
          activities = actRes.value.data as VerseActivity[];
        }
        if (watchRes.status === "fulfilled" && Array.isArray(watchRes.value.data)) {
          watchlist = watchRes.value.data.map((w) => ({
            address: w.watched_address,
            label: w.label,
          }));
        }
      } catch (err) {
        console.warn("Supabase fetch user error, using memory fallback:", err);
      }
    }

    if (!user) {
      user = inMemoryVerseStore.getUser(normalized) || {
        wallet_address: normalized,
        first_seen_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        total_points: 0,
        swap_count: 0,
        swap_volume_etn: 0,
        drop_batch_count: 0,
        drop_recipients_total: 0,
        revoke_count: 0,
        active_days_streak: 1,
        is_premium: false,
      };
      const memWatch = inMemoryVerseStore.getWatchlist(normalized);
      if (memWatch.length > 0) {
        watchlist = memWatch.map((w) => ({ address: w.watched_address, label: w.label }));
      }
    }

    // Auto-backfill check: If user has 0 recorded batches, check Blockscout for confirmed past PulseDrop transactions
    if (user.drop_batch_count === 0) {
      const backfill = await backfillUserOnChainActivity(normalized, supabase, user);
      if (backfill.pointsAdded > 0) {
        if (supabase) {
          const { data: updatedUser } = await supabase
            .from("verse_users")
            .select("*")
            .eq("wallet_address", normalized)
            .maybeSingle();
          if (updatedUser) user = updatedUser as VerseUser;

          const { data: updatedActs } = await supabase
            .from("verse_activity_ledger")
            .select("*")
            .eq("wallet_address", normalized)
            .order("created_at", { ascending: false })
            .limit(20);
          if (updatedActs && Array.isArray(updatedActs)) {
            activities = updatedActs as VerseActivity[];
          }
        } else {
          user = inMemoryVerseStore.getUser(normalized) || user;
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        user,
        activities,
        watchlist,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  }

  // --------------------------------------------------------------------------
  // 3. Loyalty Leaderboard (?leaderboard=true)
  // --------------------------------------------------------------------------
  if (url.searchParams.get("leaderboard") === "true" || url.searchParams.get("mode") === "loyalty") {
    const supabase = getSupabaseServerClient();
    let leaderboard: VerseUser[] = [];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("verse_users")
          .select("*")
          .order("total_points", { ascending: false })
          .limit(50);

        if (!error && Array.isArray(data)) {
          leaderboard = data as VerseUser[];
        }
      } catch {
        // Fallback to memory
      }
    }

    if (leaderboard.length === 0) {
      leaderboard = inMemoryVerseStore.getLeaderboard(50);
    }

    return NextResponse.json(
      {
        success: true,
        leaderboard,
        count: leaderboard.length,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  }

  // --------------------------------------------------------------------------
  // 4. Default: Network Telemetry Pipeline (VersePulse Dashboard)
  // --------------------------------------------------------------------------
  const range = readRange(request);
  const checkedAt = new Date().toISOString();
  const config = getSupabaseConfig();
  const client = getSupabaseServerClient();

  if (!config || !client) {
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
    const [uptimeResult, heatmapResult, seriesResult] = await Promise.allSettled([
      fetchUptime(client),
      fetchGasHeatmap(client),
      fetchLatencySeries(client, range),
    ]);

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

// ----------------------------------------------------------------------------
// POST Handler: Anti-Sybil Activity Verification & Cloud Watchlist Sync
// ----------------------------------------------------------------------------

interface RecordActivityBody {
  action?: "RECORD_ACTIVITY" | "SYNC_WATCHLIST" | "DAILY_CHECKIN";
  walletAddress?: string;
  actionType?:
    | "PULSEDROP_BATCH"
    | "PULSESWAP_TRADE"
    | "REVOKE_APPROVAL"
    | "PORTFOLIO_SCAN"
    | "DAILY_CHECKIN";
  txHash?: string | null;
  metadata?: Record<string, unknown>;
  watchlist?: Array<{ address: string; label: string }>;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecordActivityBody;
    const { action = "RECORD_ACTIVITY", walletAddress, actionType, txHash, metadata = {}, watchlist = [] } = body;

    if (!walletAddress || !isAddress(walletAddress, { strict: false })) {
      return NextResponse.json(
        { error: "Valid wallet address is required." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const normalizedAddress = walletAddress.toLowerCase();
    const supabase = getSupabaseServerClient();

    // ------------------------------------------------------------------------
    // Action A: Cross-Device Cloud Watchlist Sync
    // ------------------------------------------------------------------------
    if (action === "SYNC_WATCHLIST") {
      const sanitizedWatchlist = Array.isArray(watchlist)
        ? watchlist
            .filter((w) => w && typeof w.address === "string" && isAddress(w.address, { strict: false }))
            .slice(0, 50)
            .map((w) => ({
              wallet_address: normalizedAddress,
              watched_address: w.address.toLowerCase(),
              label: String(w.label || "").trim().slice(0, 32),
            }))
        : [];

      if (supabase) {
        try {
          await supabase.from("verse_watchlists").delete().eq("wallet_address", normalizedAddress);
          if (sanitizedWatchlist.length > 0) {
            await supabase.from("verse_watchlists").insert(sanitizedWatchlist);
          }
        } catch (err) {
          console.error("Supabase watchlist sync error:", err);
        }
      }

      inMemoryVerseStore.syncWatchlist(
        normalizedAddress,
        sanitizedWatchlist.map((s) => ({ address: s.watched_address, label: s.label }))
      );

      return NextResponse.json(
        {
          success: true,
          syncedCount: sanitizedWatchlist.length,
          message: "Watchlist synced successfully.",
        },
        { status: 200, headers: CORS_HEADERS }
      );
    }

    // ------------------------------------------------------------------------
    // Action B: Record Loyalty Activity with Anti-Sybil On-Chain Verification
    // ------------------------------------------------------------------------
    const resolvedActionType = action === "DAILY_CHECKIN" ? "DAILY_CHECKIN" : actionType;
    if (
      !resolvedActionType ||
      ![
        "PULSEDROP_BATCH",
        "PULSESWAP_TRADE",
        "REVOKE_APPROVAL",
        "PORTFOLIO_SCAN",
        "DAILY_CHECKIN",
      ].includes(resolvedActionType)
    ) {
      return NextResponse.json(
        { error: "Invalid action type." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const isOnChain = ["PULSEDROP_BATCH", "PULSESWAP_TRADE", "REVOKE_APPROVAL"].includes(
      resolvedActionType
    );

    // 1. On-Chain Actions Require Valid Transaction Hash
    if (isOnChain) {
      if (!txHash || typeof txHash !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        return NextResponse.json(
          { error: "Valid 32-byte transaction hash (0x...64 hex) is required for on-chain actions." },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const normalizedTxHash = txHash.toLowerCase();

      // 2. Anti-Replay Guard: Ensure tx_hash has not already been credited
      if (supabase) {
        try {
          const { data: existing } = await supabase
            .from("verse_activity_ledger")
            .select("id")
            .eq("tx_hash", normalizedTxHash)
            .maybeSingle();

          if (existing) {
            return NextResponse.json(
              { error: "Transaction already verified and credited.", alreadyProcessed: true },
              { status: 409, headers: CORS_HEADERS }
            );
          }
        } catch {
          // Fall through to memory check
        }
      }

      if (inMemoryVerseStore.hasTxHash(normalizedTxHash)) {
        return NextResponse.json(
          { error: "Transaction already verified and credited.", alreadyProcessed: true },
          { status: 409, headers: CORS_HEADERS }
        );
      }

      // 3. Cryptographic On-Chain Verification via viem on Electroneum Mainnet (52014)
      // Uses waitForTransactionReceipt with timeout & polling to eliminate race conditions
      try {
        let receipt = null;
        for (const rpc of MONITORED_RPCS) {
          try {
            const rpcClient = getRpcClient(rpc, 35_000);
            receipt = await rpcClient.waitForTransactionReceipt({
              hash: txHash as Hash,
              timeout: 25_000,
              pollingInterval: 2_000,
            });
            if (receipt) break;
          } catch {
            // Try next monitored RPC
          }
        }

        if (!receipt) {
          return NextResponse.json(
            { error: "Transaction receipt not yet confirmed on Electroneum Mainnet after 25s polling." },
            { status: 404, headers: CORS_HEADERS }
          );
        }

        if (receipt.status !== "success") {
          return NextResponse.json(
            { error: "Transaction reverted on-chain. Zero points awarded." },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        // Anti-Sybil Identity Check: Sender must match claiming wallet
        if (receipt.from.toLowerCase() !== normalizedAddress) {
          return NextResponse.json(
            { error: "Transaction sender does not match the claiming wallet address." },
            { status: 403, headers: CORS_HEADERS }
          );
        }

        metadata.blockNumber = Number(receipt.blockNumber);
      } catch (rpcErr) {
        console.warn("RPC receipt lookup error:", rpcErr);
        return NextResponse.json(
          { error: "Error verifying transaction receipt on Electroneum Mainnet." },
          { status: 502, headers: CORS_HEADERS }
        );
      }
    }

    // ------------------------------------------------------------------------
    // Point Allocation Engine & Existing User Lookup
    // ------------------------------------------------------------------------
    let existingUser: VerseUser | null = null;
    if (supabase) {
      try {
        const { data } = await supabase
          .from("verse_users")
          .select("*")
          .eq("wallet_address", normalizedAddress)
          .maybeSingle();
        if (data) existingUser = data as VerseUser;
      } catch {
        // Fallback to memory
      }
    }
    if (!existingUser) {
      existingUser = inMemoryVerseStore.getUser(normalizedAddress);
    }

    // If Daily Check-in and user has 0 recorded batches, auto-check Blockscout for past PulseDrop activity
    if (resolvedActionType === "DAILY_CHECKIN" && (!existingUser || existingUser.drop_batch_count === 0)) {
      const backfill = await backfillUserOnChainActivity(normalizedAddress, supabase, existingUser);
      if (backfill.pointsAdded > 0) {
        if (supabase) {
          const { data: refreshed } = await supabase
            .from("verse_users")
            .select("*")
            .eq("wallet_address", normalizedAddress)
            .maybeSingle();
          if (refreshed) existingUser = refreshed as VerseUser;
        } else {
          existingUser = inMemoryVerseStore.getUser(normalizedAddress) || existingUser;
        }
      }
    }

    let pointsAwarded = 0;
    let newStreak = existingUser?.active_days_streak || 1;

    if (resolvedActionType === "PULSEDROP_BATCH") {
      const recipientCount = Math.max(1, Number(metadata.recipientCount) || 1);
      pointsAwarded = 100 + recipientCount * 2;
    } else if (resolvedActionType === "PULSESWAP_TRADE") {
      pointsAwarded = 50;
    } else if (resolvedActionType === "REVOKE_APPROVAL") {
      pointsAwarded = 30;
    } else if (resolvedActionType === "PORTFOLIO_SCAN") {
      pointsAwarded = 5;
    } else if (resolvedActionType === "DAILY_CHECKIN") {
      if (existingUser && existingUser.last_active_at) {
        const timeSinceActive = Date.now() - new Date(existingUser.last_active_at).getTime();
        if (timeSinceActive < 24 * 60 * 60 * 1000) {
          return NextResponse.json(
            {
              success: true,
              message: "Daily check-in streak already logged within the last 24 hours.",
              pointsAwarded: 0,
              totalPoints: Number(existingUser.total_points) || 0,
              streak: existingUser.active_days_streak || 1,
            },
            { status: 200, headers: CORS_HEADERS }
          );
        }
        // If consecutive checkin within 48h, increment streak; otherwise reset to 1
        newStreak = timeSinceActive <= 48 * 60 * 60 * 1000 ? (existingUser.active_days_streak || 0) + 1 : 1;
      } else {
        newStreak = 1;
      }
      pointsAwarded = 10;
    }

    // ------------------------------------------------------------------------
    // Persist to Supabase Database: ALWAYS Upsert Parent verse_users FIRST!
    // ------------------------------------------------------------------------
    const nowIso = new Date().toISOString();
    let currentTotalPoints = 0;

    if (supabase) {
      try {
        const swapInc = resolvedActionType === "PULSESWAP_TRADE" ? 1 : 0;
        const swapVolInc = resolvedActionType === "PULSESWAP_TRADE" ? Number(metadata.volumeEtn) || 0 : 0;
        const dropBatchInc = resolvedActionType === "PULSEDROP_BATCH" ? 1 : 0;
        const dropRecipInc = resolvedActionType === "PULSEDROP_BATCH" ? Number(metadata.recipientCount) || 1 : 0;
        const revokeInc = resolvedActionType === "REVOKE_APPROVAL" ? 1 : 0;
        const activeStreak = resolvedActionType === "DAILY_CHECKIN" ? newStreak : (existingUser?.active_days_streak || 1);

        currentTotalPoints = (Number(existingUser?.total_points) || 0) + pointsAwarded;

        // 1. ALWAYS Upsert Parent row in public.verse_users FIRST
        const { error: userError } = await supabase.from("verse_users").upsert(
          {
            wallet_address: normalizedAddress,
            first_seen_at: existingUser ? existingUser.first_seen_at : nowIso,
            last_active_at: nowIso,
            total_points: currentTotalPoints,
            swap_count: (existingUser?.swap_count || 0) + swapInc,
            swap_volume_etn: (Number(existingUser?.swap_volume_etn) || 0) + swapVolInc,
            drop_batch_count: (existingUser?.drop_batch_count || 0) + dropBatchInc,
            drop_recipients_total: (existingUser?.drop_recipients_total || 0) + dropRecipInc,
            revoke_count: (existingUser?.revoke_count || 0) + revokeInc,
            active_days_streak: activeStreak,
            is_premium: existingUser?.is_premium || false,
          },
          { onConflict: "wallet_address" }
        );

        if (userError) {
          console.error("❌ [Supabase] verse_users upsert error:", {
            code: userError.code,
            message: userError.message,
            details: userError.details,
            hint: userError.hint,
          });
          return NextResponse.json(
            {
              error: `Database error updating user: [${userError.code}] ${userError.message}`,
              details: userError.details,
            },
            { status: 500, headers: CORS_HEADERS }
          );
        }

        // 2. Child Table: public.verse_activity_ledger (foreign key to verse_users)
        const { error: ledgerError } = await supabase.from("verse_activity_ledger").insert({
          wallet_address: normalizedAddress,
          action_type: resolvedActionType,
          tx_hash: txHash ? txHash.toLowerCase() : null,
          points_awarded: pointsAwarded,
          metadata,
          created_at: nowIso,
        });

        if (ledgerError) {
          console.error("❌ [Supabase] verse_activity_ledger insert error:", {
            code: ledgerError.code,
            message: ledgerError.message,
            details: ledgerError.details,
            hint: ledgerError.hint,
          });

          // 23505 is PostgreSQL's unique_violation error code for tx_hash
          if (ledgerError.code === "23505") {
            return NextResponse.json(
              { error: "Transaction already verified and credited.", alreadyProcessed: true },
              { status: 409, headers: CORS_HEADERS }
            );
          }

          return NextResponse.json(
            {
              error: `Database error logging activity: [${ledgerError.code}] ${ledgerError.message}`,
              details: ledgerError.details,
            },
            { status: 500, headers: CORS_HEADERS }
          );
        }
      } catch (dbErr) {
        console.error("❌ [Supabase uncaught database error]:", dbErr);
        return NextResponse.json(
          {
            error: `Database communication error: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
          },
          { status: 500, headers: CORS_HEADERS }
        );
      }
    }

    const memResult = inMemoryVerseStore.recordActivity(
      normalizedAddress,
      resolvedActionType,
      pointsAwarded,
      txHash || null,
      metadata
    );

    if (currentTotalPoints === 0) {
      currentTotalPoints = memResult.user.total_points;
    }

    return NextResponse.json(
      {
        success: true,
        actionType: resolvedActionType,
        pointsAwarded,
        totalPoints: currentTotalPoints,
        timestamp: nowIso,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("Activity API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500, headers: CORS_HEADERS }
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
