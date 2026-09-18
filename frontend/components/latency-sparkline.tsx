"use client";

import { Activity } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LATENCY_THRESHOLD_MS } from "@/lib/etn";
import { formatLatency } from "@/lib/format";
import { summarizeLatency, type LatencySeriesPoint } from "@/lib/pulse-client";
import type { RpcProbe } from "@/lib/types";

import { GlassCard, SectionHeading } from "./ui/glass-card";
import { Skeleton } from "./ui/skeleton";

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: LatencySeriesPoint }>;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="num text-[0.68rem] text-slate-500">{point.label}</p>
      <p className="num mt-1 text-sm font-medium text-cyan-300">
        {point.latencyMs === null ? "unreachable" : `${formatLatency(point.latencyMs)} ms`}
      </p>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  accent?: string;
}

function Stat({ label, value, accent = "text-slate-200" }: StatProps) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2">
      <p className="text-[0.62rem] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className={`num mt-1 text-sm font-medium ${accent}`}>{value}</p>
    </div>
  );
}

interface LatencySparklineProps {
  series: LatencySeriesPoint[];
  rpc: RpcProbe | null;
  loading: boolean;
}

export function LatencySparkline({ series, rpc, loading }: LatencySparklineProps) {
  const summary = useMemo(() => summarizeLatency(series), [series]);
  const yMax = useMemo(
    () => Math.max(LATENCY_THRESHOLD_MS * 1.4, Math.ceil((summary.max ?? 0) * 1.2), 400),
    [summary.max],
  );

  const hasChart = series.length >= 2;

  return (
    <GlassCard className="flex h-full flex-col p-5">
      <SectionHeading
        title="Latency History"
        subtitle={rpc ? `${rpc.displayName} · ${rpc.operator}` : "awaiting first probe"}
        icon={<Activity className="h-4 w-4" />}
        action={
          <span className="num rounded-full border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[0.68rem] text-slate-500">
            {summary.samples} samples
          </span>
        }
      />

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Min" value={summary.min === null ? "—" : `${formatLatency(summary.min)} ms`} />
        <Stat label="Avg" value={summary.avg === null ? "—" : `${formatLatency(summary.avg)} ms`} />
        <Stat
          label="Max"
          value={summary.max === null ? "—" : `${formatLatency(summary.max)} ms`}
          accent={
            summary.max !== null && summary.max >= LATENCY_THRESHOLD_MS
              ? "text-status-degraded"
              : "text-status-healthy"
          }
        />
      </div>

      <div className="mt-5 h-56 w-full">
        {loading && !hasChart ? (
          <Skeleton className="h-full w-full rounded-xl" />
        ) : hasChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="etnLatencyFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />

              <XAxis dataKey="label" hide />
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
                stroke="#22d3ee"
                strokeWidth={2}
                fill="url(#etnLatencyFill)"
                dot={false}
                activeDot={{ r: 3.5, fill: "#22d3ee", stroke: "#0e7490", strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-950/30">
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((index) => (
                <span
                  key={index}
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400/70"
                  style={{ animationDelay: `${index * 160}ms` }}
                />
              ))}
            </span>
            <p className="num text-xs text-slate-500">collecting samples…</p>
          </div>
        )}
      </div>

      <p className="num mt-3 text-[0.68rem] text-slate-600">
        dashed line = {LATENCY_THRESHOLD_MS} ms health threshold
      </p>
    </GlassCard>
  );
}
