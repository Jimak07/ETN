"use client";

import { DatabaseZap, ShieldCheck, TriangleAlert } from "lucide-react";
import { useMemo } from "react";

import {
  buildUptimeRows,
  formatUptimePct,
  UPTIME_HEALTHY_PCT,
  type RpcUptime,
  type UptimeRow,
  type UptimeTone,
} from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { formatCount, formatLatency } from "@/lib/format";

import { GlassCard, SectionHeading } from "./ui/glass-card";
import { Notice } from "./ui/notice";
import { Skeleton } from "./ui/skeleton";

const TONES: Record<UptimeTone, { text: string; bar: string }> = {
  healthy: { text: "text-status-healthy", bar: "bg-status-healthy" },
  degraded: { text: "text-status-degraded", bar: "bg-status-degraded" },
  unknown: { text: "text-slate-400", bar: "bg-slate-600" },
};

/** "3h ago" for the most recent failed probe, or "none in window". */
function describeLastFailure(iso: string | null): string {
  if (!iso) return "none in window";
  const failedAt = Date.parse(iso);
  if (Number.isNaN(failedAt)) return "—";

  const minutes = Math.max(0, Math.round((Date.now() - failedAt) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function formatWindowEnd(iso: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })} UTC`;
}

interface MiniStatProps {
  label: string;
  value: string;
}

function MiniStat({ label, value }: MiniStatProps) {
  return (
    <div className="min-w-0">
      <p className="text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="num mt-0.5 truncate text-xs text-slate-300">{value}</p>
    </div>
  );
}

function UptimeRowCard({ row }: { row: UptimeRow }) {
  const tone = TONES[row.tone];
  const pct = row.uptime?.uptimePct ?? null;
  const total = row.uptime?.totalSamples ?? 0;
  const successful = row.uptime?.successfulSamples ?? 0;
  const failed = row.uptime?.failedSamples ?? 0;
  const width = pct === null ? 0 : Math.min(100, Math.max(0, pct));

  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 transition duration-300 ease-out-expo hover:border-slate-700/80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-200">{row.displayName}</p>
          <p className="num mt-0.5 truncate text-[0.68rem] text-slate-500">{row.operator}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className={cn("num text-xl font-semibold leading-none", tone.text)}>
            {formatUptimePct(pct)}
            <span className="ml-0.5 text-xs font-normal text-slate-500">%</span>
          </p>
          <p className="mt-1 text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">24h uptime</p>
        </div>
      </div>

      <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-slate-800">
        <span
          className={cn("block h-full rounded-full transition-all duration-700 ease-out-expo", tone.bar)}
          style={{ width: `${width}%` }}
        />
      </span>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="Probes" value={`${formatCount(successful)}/${formatCount(total)}`} />
        <MiniStat
          label="Avg"
          value={row.uptime?.avgLatencyMs == null ? "—" : `${formatLatency(row.uptime.avgLatencyMs)} ms`}
        />
        <MiniStat
          label="p95"
          value={row.uptime?.p95LatencyMs == null ? "—" : `${formatLatency(row.uptime.p95LatencyMs)} ms`}
        />
      </div>

      <p className="num mt-2.5 flex items-center gap-1.5 text-[0.68rem] text-slate-500">
        {failed > 0 ? (
          <>
            <TriangleAlert className="h-3 w-3 shrink-0 text-status-degraded" />
            {formatCount(failed)} failed · last {describeLastFailure(row.uptime?.lastFailureAt ?? null)}
          </>
        ) : (
          <>
            <ShieldCheck className="h-3 w-3 shrink-0 text-status-healthy" />
            no failed probes in window
          </>
        )}
      </p>
    </div>
  );
}

interface UptimeMetricProps {
  uptime: RpcUptime[];
  /** First load, before any response has settled. */
  loading: boolean;
  /** null until the first response lands. */
  configured: boolean | null;
  error: string | null;
}

/**
 * Trailing-24h reliability for every monitored endpoint, shown alongside the
 * leaderboard: latency says how fast a node is *right now*, uptime says whether
 * it has been there at all.
 */
export function UptimeMetric({ uptime, loading, configured, error }: UptimeMetricProps) {
  const rows = useMemo(() => buildUptimeRows(uptime), [uptime]);
  const windowEnd = formatWindowEnd(uptime[0]?.windowEnd ?? null);
  const hasData = rows.some((row) => row.uptime !== null);

  return (
    <GlassCard className="flex h-full flex-col p-5">
      <SectionHeading
        title="24h Uptime"
        subtitle="Successful probes vs timeouts over the trailing window"
        icon={<ShieldCheck className="h-4 w-4" />}
        action={
          <span className="flex items-center gap-2.5 text-[0.62rem] uppercase tracking-[0.14em] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-status-healthy" />&ge;{UPTIME_HEALTHY_PCT}%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-status-degraded" />
              &lt;{UPTIME_HEALTHY_PCT}%
            </span>
          </span>
        }
      />

      <div className="mt-4 flex-1 space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-[8.5rem] w-full rounded-xl" />
            <Skeleton className="h-[8.5rem] w-full rounded-xl" />
          </>
        ) : error ? (
          <Notice
            tone="rose"
            icon={<TriangleAlert className="h-4 w-4" />}
            title="Uptime history unavailable"
            detail={error}
          />
        ) : configured === false ? (
          <Notice
            tone="slate"
            icon={<DatabaseZap className="h-4 w-4" />}
            title="History is not connected"
            detail="Uptime is computed from logged pulse samples. Set the Supabase credentials and run supabase/schema.sql plus supabase/02_analytics_views.sql."
          />
        ) : hasData ? (
          rows.map((row) => <UptimeRowCard key={row.rpcId} row={row} />)
        ) : (
          <Notice
            tone="slate"
            icon={<DatabaseZap className="h-4 w-4" />}
            title="No probes recorded yet"
            detail="The views are live but the window holds no samples. Uptime fills in as the worker logs cycles."
          />
        )}
      </div>

      {windowEnd && !loading && !error ? (
        <p className="num mt-3 text-[0.68rem] text-slate-600">window ending {windowEnd}</p>
      ) : null}
    </GlassCard>
  );
}
