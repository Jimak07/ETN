"use client";

import { ArrowUpRight, Coins, ExternalLink, Layers, Sparkles } from "lucide-react";
import Link from "next/link";

import { ETN_EXPLORER_URL } from "@/lib/etn";
import type { DefiPosition } from "@/lib/portfolio/types";

interface DefiTabProps {
  positions: DefiPosition[];
  loading: boolean;
}

export function DefiTab({ positions, loading }: DefiTabProps) {
  if (loading && positions.length === 0) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-28 w-full animate-pulse rounded-xl bg-slate-900/60" />
        ))}
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 p-12 text-center">
        <Layers className="h-10 w-10 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-200">No Active DeFi Positions Found</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-sm">
          No ElectroSwap V2 liquidity pool tokens (LP) or wrapped reserves were detected for this wallet.
        </p>
        <Link
          href="/swap"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 shadow-glow transition hover:bg-cyan-300"
        >
          <span>Provide Liquidity on PulseSwap</span>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3.5 sm:grid-cols-2">
        {positions.map((pos) => {
          return (
            <div
              key={pos.id}
              className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-cyan-500/25 bg-cyan-500/[0.03] p-5 transition-all duration-200 hover:border-cyan-400/50 hover:bg-cyan-500/[0.06]"
            >
              <div className="space-y-3">
                {/* Header: Protocol & Category */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
                      <Layers className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-bold text-slate-100">{pos.name}</span>
                  </div>

                  <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[0.62rem] font-semibold text-cyan-300">
                    {pos.protocol}
                  </span>
                </div>

                {/* Pooled Asset Breakdown */}
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Pooled {pos.token0.symbol}:</span>
                    <span className="font-mono font-semibold text-slate-200">
                      {Number(Number(pos.token0.amount).toFixed(4)).toLocaleString()}{" "}
                      <span className="text-slate-500 font-normal">
                        (${pos.token0.valueUsd.toFixed(2)})
                      </span>
                    </span>
                  </div>

                  {pos.token1 && (
                    <div className="flex items-center justify-between border-t border-slate-800/60 pt-1.5">
                      <span className="text-slate-400">Pooled {pos.token1.symbol}:</span>
                      <span className="font-mono font-semibold text-slate-200">
                        {Number(Number(pos.token1.amount).toFixed(4)).toLocaleString()}{" "}
                        <span className="text-slate-500 font-normal">
                          (${pos.token1.valueUsd.toFixed(2)})
                        </span>
                      </span>
                    </div>
                  )}

                  {pos.poolSharePercent < 100 && (
                    <div className="flex items-center justify-between border-t border-slate-800/60 pt-1.5 text-[0.68rem]">
                      <span className="text-slate-500">Pool Share:</span>
                      <span className="font-mono text-cyan-300 font-medium">
                        {pos.poolSharePercent}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Values & Action */}
              <div className="mt-4 flex items-center justify-between border-t border-cyan-500/15 pt-3">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Total Value</p>
                  <p className="font-mono text-base font-extrabold text-white">
                    ${pos.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`${ETN_EXPLORER_URL}/address/${pos.pairAddress}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-cyan-300 transition"
                    title="View Pair on Blockscout"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>

                  {pos.actionUrl && (
                    <Link
                      href={pos.actionUrl}
                      className="inline-flex items-center gap-1 rounded-lg bg-cyan-400 px-2.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 shadow-glow"
                    >
                      <span>Manage</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
