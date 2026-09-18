"use client";

import { Radio, Server } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/cn";
import { resolveEndpointReading } from "@/lib/endpoint-selection";
import { MONITORED_RPCS, type SelectedEndpoint } from "@/lib/etn";
import {
  driftTone,
  formatCount,
  formatDrift,
  formatLatency,
  latencyAccent,
  latencyBarWidth,
  rpcHost,
} from "@/lib/format";
import type { RpcProbe } from "@/lib/types";

import { StatusPill } from "./status-pill";
import { GlassCard, SectionHeading } from "./ui/glass-card";
import { Skeleton } from "./ui/skeleton";

interface RpcLeaderboardProps {
  rpcs: RpcProbe[];
  /** The endpoint the dashboard is currently bound to. */
  selectedEndpoint: SelectedEndpoint;
  /** Blocks a node may lag before it is reported as out of sync. */
  driftThreshold: number;
  onSelect: (selection: SelectedEndpoint) => void;
  loading: boolean;
}

const PLACEHOLDERS = MONITORED_RPCS.map((rpc) => rpc.id);

const COLUMNS = ["Endpoint", "Status", "Latency", "Block", "Drift"] as const;

export function RpcLeaderboard({
  rpcs,
  selectedEndpoint,
  driftThreshold,
  onSelect,
  loading,
}: RpcLeaderboardProps) {
  const showSkeleton = loading && rpcs.length === 0;
  // Which node "Auto" currently resolves to, so the table can show it.
  const fastestId = useMemo(
    () => resolveEndpointReading(rpcs, "fastest").rpc?.id ?? null,
    [rpcs],
  );

  return (
    <GlassCard className="p-5">
      <SectionHeading
        title="RPC Leaderboard"
        subtitle={`Latency probe + sync check · over ${driftThreshold} blocks behind is flagged`}
        icon={<Radio className="h-4 w-4" />}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect("fastest")}
              aria-pressed={selectedEndpoint === "fastest"}
              title="Follow the lowest latency across online endpoints"
              className={cn(
                "rounded-full px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] transition",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                selectedEndpoint === "fastest"
                  ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-500/30"
                  : "text-slate-500 ring-1 ring-inset ring-slate-800 hover:text-cyan-300",
              )}
            >
              Auto · fastest
            </button>
            <span className="num rounded-full border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-[0.68rem] text-slate-500">
              {rpcs.length > 0 ? `${rpcs.length} endpoints` : `${PLACEHOLDERS.length} configured`}
            </span>
          </div>
        }
      />

      <div className="-mx-5 mt-4 overflow-x-auto px-5">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">
              {COLUMNS.map((column) => (
                <th key={column} scope="col" className="pb-3 pr-4 font-medium">
                  {column}
                </th>
              ))}
              <th scope="col" className="pb-3 text-right font-medium">
                Chart
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/70">
            {showSkeleton
              ? PLACEHOLDERS.map((id) => (
                  <tr key={id}>
                    <td className="py-4 pr-4">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="py-4 pr-4">
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </td>
                    <td className="py-4 pr-4">
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="py-4 pr-4">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="py-4 pr-4">
                      <Skeleton className="h-4 w-10" />
                    </td>
                    <td className="py-4">
                      <Skeleton className="ml-auto h-6 w-16 rounded-full" />
                    </td>
                  </tr>
                ))
              : rpcs.map((rpc) => {
                  const isActive = selectedEndpoint === rpc.id;
                  // In auto mode the node being followed is highlighted instead.
                  const isFollowed = selectedEndpoint === "fastest" && rpc.id === fastestId;
                  const isHighlighted = isActive || isFollowed;
                  const isOffline = rpc.status === "offline";
                  const outOfSync = rpc.drift !== null && rpc.drift > driftThreshold;

                  return (
                    <tr
                      key={rpc.id}
                      onClick={() => onSelect(rpc.id)}
                      className={cn(
                        "cursor-pointer transition duration-200 ease-out-expo",
                        isHighlighted ? "bg-cyan-500/[0.06]" : "hover:bg-slate-800/30",
                      )}
                    >
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset",
                              rpc.role === "official"
                                ? "bg-cyan-500/10 text-cyan-300 ring-cyan-500/20"
                                : "bg-slate-800/60 text-slate-400 ring-slate-700/60",
                            )}
                          >
                            <Server className="h-3.5 w-3.5" />
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-100">
                                {rpc.displayName}
                              </span>
                              {rpc.role === "official" ? (
                                <span className="rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-cyan-300 ring-1 ring-inset ring-cyan-500/20">
                                  Official
                                </span>
                              ) : null}
                              {isFollowed ? (
                                <span className="rounded-full bg-status-healthy/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-status-healthy ring-1 ring-inset ring-status-healthy/20">
                                  Fastest
                                </span>
                              ) : null}
                            </div>
                            <span className="num block truncate text-[0.7rem] text-slate-500">
                              {rpcHost(rpc.url)}
                            </span>
                            {rpc.error ? (
                              <span
                                className={cn(
                                  "num mt-0.5 block max-w-[24rem] truncate text-[0.68rem]",
                                  isOffline ? "text-status-offline/80" : "text-status-degraded/90",
                                )}
                              >
                                {rpc.error}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className="py-4 pr-4">
                        <StatusPill status={rpc.status} />
                      </td>

                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                            <span
                              className={cn(
                                "block h-full rounded-full transition-all duration-700 ease-out-expo",
                                latencyAccent(rpc.status),
                              )}
                              style={{ width: `${latencyBarWidth(rpc.latencyMs)}%` }}
                            />
                          </span>
                          <span className="num text-sm text-slate-200">
                            {rpc.latencyMs === null ? "—" : `${formatLatency(rpc.latencyMs)} ms`}
                          </span>
                        </div>
                      </td>

                      <td className="py-4 pr-4">
                        <span className="num text-sm text-slate-300">
                          {rpc.blockNumber === null ? "—" : formatCount(rpc.blockNumber)}
                        </span>
                      </td>

                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-2">
                          <span className={cn("num text-sm", driftTone(rpc.drift, driftThreshold))}>
                            {formatDrift(rpc.drift)}
                          </span>
                          {outOfSync ? (
                            <span className="rounded-full bg-status-degraded/10 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-status-degraded ring-1 ring-inset ring-status-degraded/25">
                              Lagging
                            </span>
                          ) : rpc.drift === 0 ? (
                            <span className="text-[0.6rem] font-medium uppercase tracking-wider text-slate-600">
                              In sync
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-4 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect(rpc.id);
                          }}
                          aria-pressed={isActive}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] transition",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                            isActive
                              ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-500/30"
                              : "text-slate-500 ring-1 ring-inset ring-slate-800 hover:text-cyan-300",
                          )}
                        >
                          {isActive ? "Tracking" : "Track"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
