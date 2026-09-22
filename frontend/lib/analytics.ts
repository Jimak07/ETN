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

import { MONITORED_RPCS, getMonitoredRpc, type SelectedEndpoint } from "./etn";
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
 * History ranges
 * -------------------------------------------------------------------------- */

/**
 * Windows the latency chart can request.
 *
 * The server picks the bucket width per range (see
 * `supabase/03_latency_series.sql`), so a 30d view returns ~180 aggregated
 * points instead of ~518k raw 5s samples.
 */
export type HistoryRange = "24h" | "7d" | "30d";

export const HISTORY_RANGES: readonly HistoryRange[] = ["24h", "7d", "30d"];

/** Timeframe the chart opens on. */
export const DEFAULT_HISTORY_RANGE: HistoryRange = "24h";

export function isHistoryRange(value: string): value is HistoryRange {
  return HISTORY_RANGES.some((range) => range === value);
}

/** Captions plus the bucket width the Postgres function uses for each range. */
export const RANGE_META: Record<
  HistoryRange,
  { span: string; bucket: string; bucketSeconds: number }
> = {
  "24h": { span: "24 hours", bucket: "5-min", bucketSeconds: 300 },
  "7d": { span: "7 days", bucket: "hourly", bucketSeconds: 3600 },
  "30d": { span: "30 days", bucket: "4-hour", bucketSeconds: 14400 },
};

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

/** One (bucket, rpc) aggregate from `pulse_latency_series`. */
export interface LatencyBucketValue {
  /** Mean of the successful probes in the bucket; null when every probe failed. */
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  /** Every probe in the bucket, including timeouts and offline probes. */
  samples: number;
  successfulSamples: number;
  degradedSamples: number;
}

/** One time bucket, carrying a value per monitored RPC. */
export interface LatencyHistoryPoint {
  /** Bucket start, epoch milliseconds. */
  t: number;
  values: Record<string, LatencyBucketValue>;
}

export interface LatencyHistory {
  /** The window the server aggregated; may lag the requested one mid-switch. */
  range: HistoryRange;
  /** Bucket width the server used, in seconds. */
  bucketSeconds: number;
  points: LatencyHistoryPoint[];
}

/**
 * Which of the three independent reads failed, and why.
 *
 * The route answers 503 with whatever succeeded, so a single shared error
 * string would make the latency series outage look like a heatmap outage.
 * Each card reads only its own slot.
 */
export interface AnalyticsFailures {
  uptime: string | null;
  gasHeatmap: string | null;
  latencyHistory: string | null;
}

export const NO_FAILURES: AnalyticsFailures = {
  uptime: null,
  gasHeatmap: null,
  latencyHistory: null,
};

export interface AnalyticsResponse {
  ok: boolean;
  /** False when the deployment has no Supabase credentials at all. */
  configured: boolean;
  checkedAt: string;
  chainId: number;
  timezone: "UTC";
  uptime: RpcUptime[];
  gasHeatmap: GasHeatmapCell[];
  /** Downsampled latency series for the chart; null when that query failed. */
  latencyHistory: LatencyHistory | null;
  /** Cheapest / most expensive average-gas buckets in the heatmap window. */
  extremes: { cheapest: GasExtreme | null; priciest: GasExtreme | null };
  /** Per-query failure detail, so each card reports only its own. */
  failures: AnalyticsFailures;
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

/** PostgREST may serialise numerics as strings, so accept both. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
 * Absent or unrecognisable history degrades to null — the chart then renders an
 * explanatory empty state — rather than failing the whole payload.
 */
function normalizeLatencyHistory(value: unknown): LatencyHistory | null {
  if (!isRecord(value)) return null;
  if (typeof value.range !== "string" || !isHistoryRange(value.range)) return null;
  if (!Array.isArray(value.points)) return null;

  const range = value.range;
  return {
    range,
    bucketSeconds: toNumber(value.bucketSeconds) ?? RANGE_META[range].bucketSeconds,
    points: value.points as LatencyHistoryPoint[],
  };
}

/** Absent per-query detail degrades to "nothing failed" rather than throwing. */
function normalizeFailures(value: unknown): AnalyticsFailures {
  if (!isRecord(value)) return NO_FAILURES;

  const read = (key: keyof AnalyticsFailures): string | null =>
    typeof value[key] === "string" ? (value[key] as string) : null;

  return { uptime: read("uptime"), gasHeatmap: read("gasHeatmap"), latencyHistory: read("latencyHistory") };
}

/**
 * Fetch the aggregate views from `GET /api/analytics`.
 *
 * Like the pulse client, the request carries its own deadline so a stalled
 * database surfaces as an error in the card instead of an endless spinner.
 *
 * A well-formed envelope is accepted even on a non-2xx status: the route
 * answers 503 with whatever succeeded when one of its queries fails, and
 * `ok` / `errors` describe that. Only an unusable body is a hard failure.
 */
export async function fetchAnalytics(
  range: HistoryRange,
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
    const response = await fetch(`/api/analytics?range=${encodeURIComponent(range)}`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!isAnalyticsPayload(payload)) {
      throw new AnalyticsRequestError(
        "http",
        `Analytics API responded with ${response.status}`,
      );
    }

    return {
      ...payload,
      latencyHistory: normalizeLatencyHistory(payload.latencyHistory),
      failures: normalizeFailures(payload.failures),
    };
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

/* -------------------------------------------------------------------------- *
 * Latency chart series
 * -------------------------------------------------------------------------- */

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function utcParts(t: number) {
  const date = new Date(t);
  return {
    month: MONTH_NAMES[date.getUTCMonth()] ?? "",
    day: String(date.getUTCDate()).padStart(2, "0"),
    hour: String(date.getUTCHours()).padStart(2, "0"),
    minute: String(date.getUTCMinutes()).padStart(2, "0"),
  };
}

/**
 * X-axis tick for a bucket start, at the resolution each range deserves:
 * `HH:mm` over 24h, `MMM DD HH:mm` over 7d, `MMM DD` over 30d.
 *
 * Buckets are UTC-aligned (the SQL buckets on the epoch), so labels are UTC
 * too — matching the gas heatmap on the same page.
 */
export function formatBucketAxis(range: HistoryRange, t: number): string {
  const parts = utcParts(t);
  if (range === "24h") return `${parts.hour}:${parts.minute}`;
  if (range === "7d") return `${parts.month} ${parts.day} ${parts.hour}:${parts.minute}`;
  return `${parts.month} ${parts.day}`;
}

/** Full bucket timestamp, used as the tooltip heading. */
export function formatBucketTimestamp(t: number): string {
  const parts = utcParts(t);
  return `${parts.month} ${parts.day} ${parts.hour}:${parts.minute} UTC`;
}

export interface LatencyChartPoint {
  t: number;
  /** Pre-formatted X-axis tick. */
  axis: string;
  /** Pre-formatted tooltip heading. */
  timestamp: string;
  latencyMs: number | null;
  /** Which node the value came from — only set when the selection is aggregated. */
  rpcName: string | null;
  /** True when the bucket held at least one degraded probe. */
  degraded: boolean;
  /** Mirrors `latencyMs` on degraded buckets, so it can drive a marker series. */
  degradedMs: number | null;
  samples: number;
  failedSamples: number;
}

export interface LatencyChartSeries {
  points: LatencyChartPoint[];
  /** Newest reading, plus the extremes across buckets. */
  stats: { current: number | null; min: number | null; avg: number | null; max: number | null };
  degradedBuckets: number;
  /** Buckets where nothing answered — drawn as gaps, never as zero. */
  emptyBuckets: number;
}

interface BucketReading {
  latencyMs: number | null;
  rpcId: string | null;
  degraded: boolean;
  samples: number;
  failedSamples: number;
}

const NO_BUCKET_READING: BucketReading = {
  latencyMs: null,
  rpcId: null,
  degraded: false,
  samples: 0,
  failedSamples: 0,
};

/** Pick the value to plot for one bucket under the current selection. */
function resolveBucketReading(
  point: LatencyHistoryPoint,
  selected: SelectedEndpoint,
): BucketReading {
  if (selected === "fastest") {
    let winner: { rpcId: string; value: LatencyBucketValue } | null = null;

    for (const [rpcId, value] of Object.entries(point.values)) {
      if (value.avgMs === null || value.successfulSamples === 0) continue;
      if (winner === null || value.avgMs < (winner.value.avgMs ?? Number.POSITIVE_INFINITY)) {
        winner = { rpcId, value };
      }
    }

    if (winner === null) return NO_BUCKET_READING;
    return {
      latencyMs: winner.value.avgMs,
      rpcId: winner.rpcId,
      degraded: winner.value.degradedSamples > 0,
      samples: winner.value.samples,
      failedSamples: winner.value.samples - winner.value.successfulSamples,
    };
  }

  const value = point.values[selected];
  if (!value) return { ...NO_BUCKET_READING, rpcId: selected };

  return {
    latencyMs: value.avgMs,
    rpcId: selected,
    degraded: value.degradedSamples > 0,
    samples: value.samples,
    failedSamples: value.samples - value.successfulSamples,
  };
}

/**
 * Project the downsampled history onto a single line.
 *
 * Exactly one series is produced — the pinned endpoint's own bucket values, or
 * the lowest bucket average across online nodes for "fastest" — so nothing
 * overlaps.
 */
export function buildLatencySeries(
  history: LatencyHistory | null,
  selected: SelectedEndpoint,
): LatencyChartSeries {
  if (!history || history.points.length === 0) {
    return {
      points: [],
      stats: { current: null, min: null, avg: null, max: null },
      degradedBuckets: 0,
      emptyBuckets: 0,
    };
  }

  const { range } = history;
  const points: LatencyChartPoint[] = [];
  const values: number[] = [];
  let degradedBuckets = 0;
  let emptyBuckets = 0;

  for (const bucket of history.points) {
    const reading = resolveBucketReading(bucket, selected);

    if (reading.latencyMs === null) emptyBuckets += 1;
    else values.push(reading.latencyMs);
    if (reading.degraded) degradedBuckets += 1;

    points.push({
      t: bucket.t,
      axis: formatBucketAxis(range, bucket.t),
      timestamp: formatBucketTimestamp(bucket.t),
      latencyMs: reading.latencyMs,
      // Naming the node only matters when the line can change hands.
      rpcName:
        selected === "fastest" && reading.rpcId
          ? (getMonitoredRpc(reading.rpcId)?.displayName ?? reading.rpcId)
          : null,
      degraded: reading.degraded,
      degradedMs: reading.degraded ? reading.latencyMs : null,
      samples: reading.samples,
      failedSamples: reading.failedSamples,
    });
  }

  // Newest reading, skipping trailing buckets where nothing answered.
  let current: number | null = null;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.latencyMs ?? null;
    if (value !== null) {
      current = value;
      break;
    }
  }

  const stats =
    values.length === 0
      ? { current: null, min: null, avg: null, max: null }
      : {
          current,
          min: Math.min(...values),
          avg: values.reduce((sum, value) => sum + value, 0) / values.length,
          max: Math.max(...values),
        };

  return { points, stats, degradedBuckets, emptyBuckets };
}
