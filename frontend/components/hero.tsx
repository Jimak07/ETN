"use client";

import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/cn";
import { ETN_CHAIN_ID, ETN_CHAIN_NAME } from "@/lib/etn";
import type { PulseConnection } from "@/lib/types";
import { useRelativeTime } from "@/hooks/use-relative-time";

import { AddEtnButton } from "./add-etn-button";

interface HeroProps {
  connection: PulseConnection;
  lastUpdated: number | null;
  /** True while a request is in flight — the icon spins only then. */
  isFetching: boolean;
  /** True when the last pulse is missing or too old to trust. */
  isStale: boolean;
  onRefresh: () => void;
}

const CONNECTION_COPY: Record<PulseConnection, { label: string; tone: string }> = {
  connecting: { label: "Connecting", tone: "text-slate-400" },
  live: { label: "Network live", tone: "text-cyan-300" },
  degraded: { label: "Degraded", tone: "text-status-degraded" },
  offline: { label: "Offline", tone: "text-status-offline" },
};

export function Hero({ connection, lastUpdated, isFetching, isStale, onRefresh }: HeroProps) {
  // Age is surfaced only when it matters: an error/timeout, or a pulse that has
  // gone stale. Healthy operation shows no elapsed time at all.
  const showAge = isStale || connection !== "live";
  const relativeTime = useRelativeTime(lastUpdated, { enabled: showAge });
  const copy = CONNECTION_COPY[connection];
  const isAlive = connection !== "offline";
  const ageLabel = lastUpdated === null ? "Awaiting first pulse" : `Last pulse ${relativeTime}`;

  return (
    <header className="glass-panel shadow-card animate-fade-up px-5 py-6 sm:px-7 sm:py-8">
      <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <p className="num text-[0.68rem] uppercase tracking-[0.28em] text-slate-500">
            {ETN_CHAIN_NAME} Smart Chain · Chain {ETN_CHAIN_ID}
          </p>

          <div className="flex items-center gap-3">
            {/* CSS-animated cyan pulse = network life indicator */}
            <span className="relative flex h-3 w-3" aria-hidden>
              {isAlive ? (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              ) : null}
              <span
                className={cn(
                  "relative inline-flex h-3 w-3 rounded-full",
                  isAlive
                    ? "bg-cyan-400 shadow-[0_0_14px_3px_rgba(34,211,238,0.55)]"
                    : "bg-status-offline",
                )}
              />
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
              ETN Pulse
            </h1>
          </div>

          <p className="max-w-xl text-sm leading-relaxed text-slate-400">
            Real-time block height, gas price and RPC latency telemetry — the monitoring core of the
            Electroneum utility hub.
          </p>
        </div>

        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-3.5 py-2.5">
            <span className={cn("text-xs font-medium", copy.tone)}>{copy.label}</span>
            {showAge ? (
              <>
                <span className="h-4 w-px bg-slate-800" aria-hidden />
                <span className="num text-xs text-slate-500">{ageLabel}</span>
              </>
            ) : null}
            <button
              type="button"
              onClick={onRefresh}
              aria-label="Refresh network telemetry"
              aria-busy={isFetching}
              title="Refresh now"
              className="ml-1 rounded-md p-1 text-slate-500 transition hover:bg-slate-800/60 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isFetching && "animate-spin text-cyan-300")}
              />
            </button>
          </div>

          <AddEtnButton />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-800/80 pt-4 text-[0.7rem] text-slate-500">
        <span className="num">official + ankr endpoints</span>
        <span className="num">explorer · blockexplorer.electroneum.com</span>
      </div>
    </header>
  );
}
