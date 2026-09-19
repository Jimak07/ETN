/**
 * Analytics contract and client for the ETN Pulse dashboard.
 *
 * The response types below are the canonical shape: `app/api/analytics/route.ts`
 * imports them, so the server payload and this parser can never drift apart.
 *
 * These aggregates move far slower than the 5s pulse — a trailing 24h uptime
 * window and a day/hour gas profile — so they are polled on a lazy cadence and
 * kept in a single hook.
 */

import { MONITORED_RPCS } from "./etn";
import { parseDecimalString } from "./format";

/* -------------------------------------------------------------------------- *
 * Cadence
 * -------------------------------------------------------------------------- */

/** Aggregate data: a minute of staleness costs nothing, so poll lazily. */
export const ANALYTICS_POLL_INTERVAL_MS = 60_000;

/** Back-off after a failed read, so a broken database is not hammered. */
export const ANALYTICS_RETRY_INTERVAL_MS = 15_000;

/** How long a single analytics read waits before it is abandoned. */
export const ANALYTICS_CLIENT_TIMEOUT_MS = 8000;

/** Uptime at or above this reads as healthy (green); below it reads as amber. */
export const UPTIME_HEALTHY_PCT = 99;

/* -------------------------------------------------------------------------- *
 * Response types (server <-> client contract)
 * -------------------------------------------------------------------------- */

export interface RpcUptime {
  rpcId: string;
  windowStart: string | null;
  windowEnd: string | null;
  totalSamples: number;
  /** Probes that returned a latency — i.e. not a timeout or offline probe. */
  successfulSamples: number;
  failedSamples: number;
  /** 0-100, rounded to two decimals. */
  uptimePct: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
  degradedSamples: number;
  lastFailureAt: string | null;
}

export interface GasHeatmapCell {
  /** ISO day of week: 1 = Monday ... 7 = Sunday. */
  dayOfWeek: number;
  dayName: string;
  /** 0-23, UTC. */
  hourOfDay: number;
  /** Pre-formatted "Monday 14:00" for chart axes and tooltips. */
  label: string;
  sampleCount: number;
  /** Precision-safe decimal strings, mirroring the `gas_price_gwei` column. */
  avgGasPriceGwei: string | null;
  minGasPriceGwei: string | null;
  maxGasPriceGwei: string | null;
  stddevGasPriceGwei: string | null;
}

export interface GasExtreme {
  label: string;
  dayOfWeek: number;
  hourOfDay: number;
  avgGasPriceGwei: string | null;
}

export interface AnalyticsResponse {
  ok: boolean;
  /** False when the deployment has no Supabase credentials at all. */
  configured: boolean;
  checkedAt: string;
  chainId: number;
  timezone: "UTC";
  uptime: RpcUptime[];
  gasHeatmap: GasHeatmapCell[];
  /** Cheapest / most expensive average-gas buckets in the heatmap window. */
  extremes: { cheapest: GasExtreme | null; priciest: GasExtreme | null };
  errors: string[];
}

/* -------------------------------------------------------------------------- *
 * Client
 * -------------------------------------------------------------------------- */

export type AnalyticsRequestErrorKind = "timeout" | "offline" | "http" | "malformed" | "aborted";

export class AnalyticsRequestError extends Error {
  readonly kind: AnalyticsRequestErrorKind;

  constructor(kind: AnalyticsRequestErrorKind, message: string) {
    super(message);
    this.name = "AnalyticsRequestError";
    this.kind = kind;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A payload is usable when it carries the envelope fields the UI indexes into. */
function isAnalyticsPayload(value: unknown): value is AnalyticsResponse {
  return (
    isRecord(value) &&
    typeof value.checkedAt === "string" &&
    Array.isArray(value.uptime) &&
    Array.isArray(value.gasHeatmap)
  );
}

/**
 * Fetch the aggregate views from `GET /api/analytics`.
 *
 * Like the pulse client, the request carries its own deadline so a stalled
 * database surfaces as an error in the card instead of an endless spinner.
 * A non-2xx response is reported with the route's own `errors[0]`, which names
 * the missing migration when a view has not been created yet.
 */
export async function fetchAnalytics(
  signal?: AbortSignal,
  timeoutMs: number = ANALYTICS_CLIENT_TIMEOUT_MS,
): Promise<AnalyticsResponse> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort);

  try {
    const response = await fetch("/api/analytics", {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        isRecord(payload) && Array.isArray(payload.errors) && typeof payload.errors[0] === "string"
          ? payload.errors[0]
          : `Analytics API responded with ${response.status}`;
      throw new AnalyticsRequestError("http", detail);
    }

    if (!isAnalyticsPayload(payload)) {
      throw new AnalyticsRequestError("malformed", "Malformed analytics payload received");
    }

    return payload;
  } catch (caught) {
    if (caught instanceof AnalyticsRequestError) throw caught;
    if (signal?.aborted) throw new AnalyticsRequestError("aborted", "Analytics request cancelled");
    if (timedOut) {
      throw new AnalyticsRequestError(
        "timeout",
        `Analytics did not answer within ${(timeoutMs / 1000).toFixed(1)}s`,
      );
    }
    throw new AnalyticsRequestError("offline", "Could not reach the analytics engine (/api/analytics)");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

/* -------------------------------------------------------------------------- *
 * Uptime helpers
 * -------------------------------------------------------------------------- */

export type UptimeTone = "healthy" | "degraded" | "unknown";

/**
 * Green once 24h uptime reaches the 99% threshold, amber below it. A missing
 * percentage (no probes in the window) is neither.
 */
export function uptimeTone(pct: number | null | undefined): UptimeTone {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "unknown";
  return pct >= UPTIME_HEALTHY_PCT ? "healthy" : "degraded";
}

export function formatUptimePct(pct: number | null | undefined, digits = 2): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return "—";
  return pct.toFixed(digits);
}

export interface UptimeRow {
  rpcId: string;
  displayName: string;
  operator: string;
  /** The view row, or null when this RPC has never been recorded. */
  uptime: RpcUptime | null;
  tone: UptimeTone;
}

/**
 * Order the uptime view by the endpoints this build knows about, so the panel
 * always lists Official then Ankr regardless of what the view returns. Any id
 * the engine reports that this build has not heard of is appended rather than
 * dropped.
 */
export function buildUptimeRows(uptime: readonly RpcUptime[]): UptimeRow[] {
  const remaining = new Map(uptime.map((row) => [row.rpcId, row]));

  const rows: UptimeRow[] = MONITORED_RPCS.map((rpc) => {
    const row = remaining.get(rpc.id) ?? null;
    remaining.delete(rpc.id);
    return {
      rpcId: rpc.id,
      displayName: rpc.displayName,
      operator: rpc.operator,
      uptime: row,
      tone: uptimeTone(row?.uptimePct ?? null),
    };
  });

  for (const row of remaining.values()) {
    rows.push({
      rpcId: row.rpcId,
      displayName: row.rpcId,
      operator: "unrecognised endpoint",
      uptime: row,
      tone: uptimeTone(row.uptimePct),
    });
  }

  return rows;
}

/* -------------------------------------------------------------------------- *
 * Gas heatmap helpers
 * -------------------------------------------------------------------------- */

/** ISO day 1 = Monday, so index 0 is Monday. */
const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export interface HeatmapCell {
  dayOfWeek: number;
  dayName: string;
  hourOfDay: number;
  /** "Monday 14:00" */
  label: string;
  /** Parsed average Gwei; null when the bucket holds no samples. */
  avgGwei: number | null;
  minGwei: number | null;
  maxGwei: number | null;
  sampleCount: number;
}

export interface HeatmapRow {
  dayOfWeek: number;
  dayName: string;
  /** "Mon" — the y-axis label. */
  shortName: string;
  cells: HeatmapCell[];
}

export interface HeatmapGrid {
  rows: HeatmapRow[];
  hours: number[];
  /** Extremes across populated buckets; null when nothing has been recorded. */
  minGwei: number | null;
  maxGwei: number | null;
  /** Number of (day, hour) buckets holding samples, and their total samples. */
  populatedBuckets: number;
  samples: number;
}

/**
 * Pivot the view's sparse (day, hour) rows into a dense 7x24 matrix.
 *
 * Days and hours are fixed rather than derived from the data, so the axes keep
 * their shape instead of collapsing when the network is quiet.
 */
export function buildHeatmapGrid(cells: readonly GasHeatmapCell[]): HeatmapGrid {
  const byBucket = new Map<string, GasHeatmapCell>();
  for (const cell of cells) {
    byBucket.set(`${cell.dayOfWeek}:${cell.hourOfDay}`, cell);
  }

  let minGwei: number | null = null;
  let maxGwei: number | null = null;
  let populatedBuckets = 0;
  let samples = 0;

  const rows: HeatmapRow[] = DAY_NAMES.map((dayName, index) => {
    const dayOfWeek = index + 1;

    const dayCells: HeatmapCell[] = HOURS.map((hourOfDay) => {
      const source = byBucket.get(`${dayOfWeek}:${hourOfDay}`) ?? null;
      const avgGwei = source ? parseDecimalString(source.avgGasPriceGwei) : null;

      if (avgGwei !== null) {
        populatedBuckets += 1;
        samples += source?.sampleCount ?? 0;
        minGwei = minGwei === null ? avgGwei : Math.min(minGwei, avgGwei);
        maxGwei = maxGwei === null ? avgGwei : Math.max(maxGwei, avgGwei);
      }

      return {
        dayOfWeek,
        dayName,
        hourOfDay,
        label: `${dayName} ${String(hourOfDay).padStart(2, "0")}:00`,
        avgGwei,
        minGwei: source ? parseDecimalString(source.minGasPriceGwei) : null,
        maxGwei: source ? parseDecimalString(source.maxGasPriceGwei) : null,
        sampleCount: source?.sampleCount ?? 0,
      };
    });

    return { dayOfWeek, dayName, shortName: dayName.slice(0, 3), cells: dayCells };
  });

  return { rows, hours: HOURS, minGwei, maxGwei, populatedBuckets, samples };
}

/**
 * Position of a bucket within the window: 0 = cheapest, 1 = most expensive.
 * Returns null for an empty bucket. A flat window (every bucket identical, or
 * a single sample) collapses to 0 so the grid reads as uniformly cheap rather
 * than uniformly mid-scale.
 */
export function heatmapIntensity(
  value: number | null,
  min: number | null,
  max: number | null,
): number | null {
  if (value === null || min === null || max === null) return null;
  if (max <= min) return 0;
  return (value - min) / (max - min);
}

/** Hue endpoints: emerald for cheap, amber through the middle, red for dear. */
const HUE_CHEAP = 152;
const HUE_EXPENSIVE = 0;

/**
 * Green -> amber -> red scale tuned for the dark glass shell: mid lightness and
 * high saturation so cells stay legible against `bg-slate-950`.
 */
export function heatmapColor(intensity: number): string {
  const clamped = Math.min(1, Math.max(0, intensity));
  const hue = HUE_CHEAP + (HUE_EXPENSIVE - HUE_CHEAP) * clamped;
  return `hsl(${hue.toFixed(1)} 72% 42%)`;
}

/** CSS gradient mirroring `heatmapColor`, for the legend. */
export function heatmapGradient(steps = 16): string {
  const stops = Array.from({ length: steps + 1 }, (_, index) => {
    const intensity = index / steps;
    return `${heatmapColor(intensity)} ${(intensity * 100).toFixed(0)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
