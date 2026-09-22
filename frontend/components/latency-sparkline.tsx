"use client";

import { Activity, Loader2, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  buildLatencySeries,
  formatBucketAxis,
  HISTORY_RANGES,
  RANGE_META,
  type HistoryRange,
  type LatencyChartPoint,
  type LatencyHistory,
} from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { getMonitoredRpc, LATENCY_THRESHOLD_MS, type SelectedEndpoint } from "@/lib/etn";
import { formatCount, formatLatency } from "@/lib/format";
import type { RpcProbe } from "@/lib/types";

import { GlassCard, SectionHeading } from "./ui/glass-card";
import { Notice } from "./ui/notice";
import { Skeleton } from "./ui/skeleton";

/**
 * Latency history for the selected endpoint.
 *
 * Exactly one line is drawn, because the chart answers "how has *this* node
 * behaved?" — and the answer differs per endpoint. Overlapping lines hid which
 * node was slow, so the series is resolved from `selectedEndpoint` instead:
 * a pinned node plots its own buckets, "fastest" plots the lowest bucket
 * average across the nodes that answered.
 *
 * Data comes from `pulse_latency_series(range)`, which buckets in Postgres
 * (5 min / 1 h / 4 h), so a 30d window is ~180 points instead of ~518k rows.
 */

/* -------------------------------------------------------------------------- *
 * Tooltip
 * -------------------------------------------------------------------------- */

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: LatencyChartPoint }>;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  const unreachable = point.latencyMs === null;

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="num text-[0.68rem] text-slate-500">{point.timestamp}</p>
      <p
        className={cn(
          "num mt-1 text-sm font-medium",
          unreachable
            ? "text-status-offline"
            : point.degraded
              ? "text-status-degraded"
              : "text-cyan-300",
        )}
      >
        {unreachable ? "no successful probe" : `${formatLatency(point.latencyMs)} ms · bucket avg`}
      </p>
      {point.rpcName ? (
        <p className="num text-[0.68rem] text-cyan-300/80">fastest · {point.rpcName}</p>
      ) : null}
      <p className="num mt-1 text-[0.68rem] text-slate-500">
        {formatCount(point.samples)} probes
        {point.failedSamples > 0 ? ` · ${formatCount(point.failedSamples)} failed` : ""}
      </p>
      {point.degraded ? (
        <p className="num text-[0.68rem] text-status-degraded">flagged degraded</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- *
 * Stats
 * -------------------------------------------------------------------------- */

interface StatProps {
  label: string;
  value: string;
  accent?: string;
}

function Stat({ label, value, accent = "text-slate-200" }: StatProps) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2">
      <p className="text-[0.62rem] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={cn("num mt-1 text-sm font-medium", accent)}>{value}</p>
    </div>
  );
}

function formatMs(value: number | null): string {
  return value === null ? "—" : `${formatLatency(value)} ms`;
}

/* -------------------------------------------------------------------------- *
 * Timeframe toolbar
 * -------------------------------------------------------------------------- */

interface RangeOptionProps {
  range: HistoryRange;
  active: boolean;
  onSelect: (range: HistoryRange) => void;
}

/** Same pill styling as the leaderboard's `Auto · fastest` toggle. */
function RangeOption({ range, active, onSelect }: RangeOptionProps) {
  const meta = RANGE_META[range];

  return (
    <button
      type="button"
      onClick={() => onSelect(range)}
      aria-pressed={active}
      title={`${meta.span} · ${meta.bucket} buckets`}
      className={cn(
        "rounded-full px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
        active
          ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-500/30"
          : "text-slate-500 hover:text-cyan-300",
      )}
    >
      {range}
    </button>
  );
}

/* -------------------------------------------------------------------------- *
 * Chart
 * -------------------------------------------------------------------------- */

interface LatencySparklineProps {
  /** The endpoint the whole dashboard is bound to. */
  selectedEndpoint: SelectedEndpoint;
  /** Downsampled buckets for the active window; null when that read failed. */
  history: LatencyHistory | null;
  /** The window the user asked for. */
  range: HistoryRange;
  onRangeChange: (range: HistoryRange) => void;
  /** Live probe for the selection, so the header ties into the 5s pulse. */
  rpc: RpcProbe | null;
  /** No analytics response has arrived yet. */
  loading: boolean;
  /** A read is in flight. */
  fetching: boolean;
  /** The payload on screen still belongs to the previous window. */
  switchingRange: boolean;
  error: string | null;
}

export function LatencySparkline({
  selectedEndpoint,
  history,
  range,
  onRangeChange,
  rpc,
  loading,
  fetching,
  switchingRange,
  error,
}: LatencySparklineProps) {
  const series = useMemo(
    () => buildLatencySeries(history, selectedEndpoint),
    [history, selectedEndpoint],
  );
  const { points, stats } = series;

  const label = useMemo(() => {
    if (selectedEndpoint === "fastest") {
      return {
        name: "Auto · lowest of the online nodes",
        hint: "minimum bucket average across online endpoints",
      };
    }
    const known = getMonitoredRpc(selectedEndpoint);
    return {
      name: known?.displayName ?? selectedEndpoint,
      hint: `${known?.operator ?? "unknown operator"} · own probes only`,
    };
  }, [selectedEndpoint]);

  /**
   * Axis and caption follow the *payload's* window, not the requested one. If a
   * switch fails we keep the last good data, and it must stay labelled as what
   * it actually is.
   */
  const axisRange = history?.range ?? range;
  const bucket = RANGE_META[axisRange];

  const yMax = useMemo(
    () => Math.max(LATENCY_THRESHOLD_MS * 1.4, Math.ceil((stats.max ?? 0) * 1.2), 400),
    [stats.max],
  );

  const hasChart = points.length >= 2;
  const live =
    rpc === null
      ? null
      : rpc.latencyMs === null
        ? "offline now"
        : `${formatLatency(rpc.latencyMs)} ms now`;

  const maxAccent =
    stats.max !== null && stats.max >= LATENCY_THRESHOLD_MS
      ? "text-status-degraded"
      : "text-status-healthy";

  return (
    <GlassCard className="flex h-full flex-col p-5">
      <SectionHeading
        title="Latency History"
        subtitle={`${label.name} · ${bucket.bucket} averages over ${bucket.span}${
          live === null ? "" : ` · live ${live}`
        }`}
        icon={<Activity className="h-4 w-4" />}
        action={
          <div className="flex items-center gap-2">
            {/* Reserved slot: the spinner appears without nudging the pills. */}
            <span className="flex h-6 w-6 items-center justify-center">
              {fetching && !switchingRange ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" aria-hidden />
              ) : null}
            </span>
            <div className="flex items-center gap-0.5 rounded-full border border-slate-800 bg-slate-950/60 p-0.5">
              {HISTORY_RANGES.map((option) => (
                <RangeOption
                  key={option}
                  range={option}
                  active={option === range}
                  onSelect={onRangeChange}
                />
              ))}
            </div>
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Current" value={formatMs(stats.current)} accent="text-cyan-300" />
        <Stat label="Min" value={formatMs(stats.min)} accent="text-status-healthy" />
        <Stat label="Avg" value={formatMs(stats.avg)} />
        <Stat label="Max" value={formatMs(stats.max)} accent={maxAccent} />
      </div>

      <div className="relative mt-5 h-56 w-full">
        {loading && !hasChart ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : hasChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="etnLatencyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value: number) => formatBucketAxis(axisRange, value)}
                tickLine={false}
                axisLine={{ stroke: "#1e293b" }}
                tick={{ fill: "#64748b", fontSize: 10, fontFamily: "var(--font-mono)" }}
                minTickGap={28}
              />
              <YAxis
                width={42}
                domain={[0, yMax]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#64748b", fontSize: 11, fontFamily: "var(--font-mono)" }}
              />

              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "#22d3ee", strokeOpacity: 0.25 }}
              />

              <ReferenceLine
                y={LATENCY_THRESHOLD_MS}
                stroke="#fbbf24"
                strokeOpacity={0.55}
                strokeDasharray="4 4"
                label={{
                  value: `${LATENCY_THRESHOLD_MS} ms`,
                  position: "insideTopRight",
                  fill: "#fbbf24",
                  fontSize: 10,
                }}
              />

              <Area
                type="monotone"
                dataKey="latencyMs"
                name={label.name}
                stroke="#22d3ee"
                strokeWidth={2}
                fill="url(#etnLatencyFill)"
                dot={false}
                activeDot={{ r: 3.5, fill: "#22d3ee", stroke: "#0e7490", strokeWidth: 2 }}
                // Gaps are the point: a bucket with no answer must not be
                // bridged, or the line would imply a reading that never existed.
                connectNulls={false}
                isAnimationActive={false}
              />

              {/* Degraded buckets: markers only, so one amber dot cannot be
                  mistaken for a second series. */}
              <Line
                type="monotone"
                dataKey="degradedMs"
                stroke="none"
                dot={{ r: 3, fill: "#fbbf24", stroke: "#78350f", strokeWidth: 1 }}
                activeDot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : error ? (
          <Notice
            tone="rose"
            icon={<TriangleAlert className="h-4 w-4" />}
            title="Latency history unavailable"
            detail={error}
            className="h-full"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-950/30 px-4 text-center">
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400/70"
                  style={{ animationDelay: `${index * 160}ms` }}
                />
              ))}
            </span>
            <p className="num text-xs text-slate-500">
              {points.length === 1
                ? "one bucket recorded — a second one draws the line"
                : `no samples in the last ${bucket.span}`}
            </p>
            <p className="text-[0.68rem] text-slate-600">
              the backend poller writes one row every 5s, so this window fills in as history accrues
            </p>
          </div>
        )}

        {switchingRange ? (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border border-slate-800/70 bg-slate-950/70 backdrop-blur-sm"
          >
            <Loader2 className="h-4 w-4 animate-spin text-cyan-400" aria-hidden />
            <p className="num text-[0.7rem] text-slate-400">
              aggregating {RANGE_META[range].span}…
            </p>
          </div>
        ) : null}
      </div>

      <p className="num mt-3 text-[0.68rem] text-slate-600">
        {label.hint} · {bucket.bucket} buckets over {bucket.span} ·{" "}
        {formatCount(points.length)} buckets
        {series.degradedBuckets > 0 ? ` · ${series.degradedBuckets} degraded` : ""}
        {series.emptyBuckets > 0 ? ` · ${series.emptyBuckets} with no answer` : ""} · dashed line ={" "}
        {LATENCY_THRESHOLD_MS} ms health threshold
      </p>
    </GlassCard>
  );
}
