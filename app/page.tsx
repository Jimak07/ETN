"use client";

import { ExternalLink, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { Hero } from "@/components/hero";
import { KpiCards } from "@/components/kpi-cards";
import { LatencySparkline } from "@/components/latency-sparkline";
import { ModuleHub } from "@/components/module-hub";
import { RpcLeaderboard } from "@/components/rpc-leaderboard";
import { usePulse } from "@/hooks/use-pulse";
import { cn } from "@/lib/cn";
import { DRIFT_THRESHOLD, ETN_EXPLORER_URL, POLL_INTERVAL_MS } from "@/lib/etn";
import { buildLatencySeries } from "@/lib/pulse-client";
import type { PulseConnection } from "@/lib/types";

interface AlertBannerProps {
  error: string | null;
  connection: PulseConnection;
}

function AlertBanner({ error, connection }: AlertBannerProps) {
  if (!error) return null;

  const isOffline = connection === "offline";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "animate-fade-up flex items-start gap-3 rounded-xl border px-4 py-3 text-xs backdrop-blur-md",
        isOffline
          ? "border-status-offline/30 bg-status-offline/[0.07] text-status-offline"
          : "border-status-degraded/30 bg-status-degraded/[0.07] text-status-degraded",
      )}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-0.5">
        <p className="font-medium">
          {isOffline ? "Monitoring engine unreachable" : "Partial RPC degradation"}
        </p>
        <p className="num leading-relaxed opacity-90">{error}</p>
        <p className="opacity-70">
          Retrying automatically — the last good snapshot is still shown.
        </p>
      </div>
    </div>
  );
}

interface WarmUpNoticeProps {
  elapsedMs: number;
  onRetry: () => void;
}

/** Shown only until the first response lands, so the wait is never ambiguous. */
function WarmUpNotice({ elapsedMs, onRetry }: WarmUpNoticeProps) {
  const seconds = Math.round(elapsedMs / 1000);

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-fade-up flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400 backdrop-blur-md"
    >
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400/70"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
      <span>
        Contacting the monitoring engine…{" "}
        <span className="num text-slate-500">{seconds}s</span>
      </span>
      <span className="text-slate-600">
        the first request also compiles the API route in dev, so it can take a few seconds
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full border border-slate-700 px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
      >
        Retry now
      </button>
    </div>
  );
}

export default function Page() {
  const {
    snapshot,
    history,
    connection,
    error,
    lastUpdated,
    isLoading,
    isPolling,
    elapsedMs,
    refresh,
  } = usePulse();

  const [trackedRpcId, setTrackedRpcId] = useState<string | null>(null);

  const activeRpcId = trackedRpcId ?? snapshot?.fastestRpcId ?? snapshot?.rpcs[0]?.id ?? null;
  const activeRpc = useMemo(
    () => snapshot?.rpcs.find((rpc) => rpc.id === activeRpcId) ?? null,
    [snapshot, activeRpcId],
  );
  const series = useMemo(() => buildLatencySeries(history, activeRpcId), [history, activeRpcId]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="space-y-4 lg:space-y-6">
        <Hero
          connection={connection}
          lastUpdated={lastUpdated}
          isPolling={isPolling}
          onRefresh={refresh}
        />

        {isLoading ? <WarmUpNotice elapsedMs={elapsedMs} onRetry={refresh} /> : null}

        <AlertBanner error={error} connection={connection} />

        <KpiCards snapshot={snapshot} history={history} loading={isLoading} />

        <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
          <div className="lg:col-span-3">
            <RpcLeaderboard
              rpcs={snapshot?.rpcs ?? []}
              activeRpcId={activeRpcId}
              driftThreshold={snapshot?.driftThreshold ?? DRIFT_THRESHOLD}
              onSelect={setTrackedRpcId}
              loading={isLoading}
            />
          </div>
          <div className="lg:col-span-2">
            <LatencySparkline series={series} rpc={activeRpc} loading={isLoading} />
          </div>
        </div>

        <ModuleHub />

        <footer className="flex flex-col gap-2 border-t border-slate-800/80 pt-5 text-[0.7rem] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p className="num">
            ETN Pulse · chain 52014 · polling /api/pulse every {POLL_INTERVAL_MS / 1000}s
          </p>
          <a
            href={ETN_EXPLORER_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-slate-500 transition hover:text-cyan-300"
          >
            Block explorer <ExternalLink className="h-3 w-3" />
          </a>
        </footer>
      </div>
    </main>
  );
}
