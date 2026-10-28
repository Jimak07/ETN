"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Crown,
  ExternalLink,
  Flame,
  LineChart,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";

import { IS_PREMIUM_USER } from "@/lib/constants/myverse";
import { ETN_EXPLORER_URL } from "@/lib/etn";
import { fetchLiveWhaleSwaps, SMART_MONEY_LEADERBOARD } from "@/lib/portfolio/smart-money";
import type { WhaleSwapEvent } from "@/lib/portfolio/types";
import { cn } from "@/lib/cn";

interface SmartMoneyTabProps {
  etnUsdPrice: number;
  onSelectAddress: (address: string) => void;
}

export function SmartMoneyTab({ etnUsdPrice, onSelectAddress }: SmartMoneyTabProps) {
  const [swaps, setSwaps] = useState<WhaleSwapEvent[]>([]);
  const [loadingSwaps, setLoadingSwaps] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const loadSwaps = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoadingSwaps(true);

    try {
      const data = await fetchLiveWhaleSwaps(etnUsdPrice);
      setSwaps(data);
    } catch {
      // Fallback
    } finally {
      setLoadingSwaps(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadSwaps(false);
    // Poll every 30 seconds
    const interval = setInterval(() => {
      void loadSwaps(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [etnUsdPrice]);

  return (
    <div className="space-y-8">
      {/* 1. Curated Smart Money Leaderboard */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Smart Money Leaderboard</h3>
              {IS_PREMIUM_USER && (
                <span className="rounded bg-cyan-400/20 border border-cyan-400/40 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-cyan-300">
                  PRO RADAR
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Curated on-chain intelligence on verified top holders, liquidity suppliers, and DEX arbitrageurs.
            </p>
          </div>

          <span className="self-start sm:self-auto rounded-full border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-400 font-mono">
            {SMART_MONEY_LEADERBOARD.length} Tracked Alpha Wallets
          </span>
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {SMART_MONEY_LEADERBOARD.map((wallet) => {
            return (
              <div
                key={wallet.address}
                className="group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition-all duration-200 hover:border-cyan-500/40 hover:bg-slate-900/90"
              >
                <div className="space-y-3">
                  {/* Header: Label, Category Badge & External link */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-100 text-sm">{wallet.label}</span>
                        <span className="rounded bg-cyan-500/10 border border-cyan-500/30 px-1.5 py-0.2 text-[0.6rem] font-semibold text-cyan-300">
                          {wallet.category}
                        </span>
                      </div>
                      <p className="text-[0.68rem] text-slate-400 mt-0.5">{wallet.tag}</p>
                    </div>

                    <a
                      href={`${ETN_EXPLORER_URL}/address/${wallet.address}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="View on Explorer"
                      className="p-1 rounded text-slate-500 hover:text-cyan-300 transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800/80 bg-slate-950/70 p-2.5 text-xs font-mono">
                    <div>
                      <p className="text-[0.6rem] uppercase tracking-wider text-slate-500">
                        Holding Value
                      </p>
                      <p className="font-bold text-slate-200 mt-0.5">
                        ${wallet.holdingValueUsd.toLocaleString()}
                      </p>
                    </div>

                    <div>
                      <p className="text-[0.6rem] uppercase tracking-wider text-slate-500">
                        Win Rate
                      </p>
                      <p className="font-bold text-emerald-400 mt-0.5">
                        {wallet.winRatePercent.toFixed(1)}%
                      </p>
                    </div>

                    <div className="col-span-2 border-t border-slate-800/60 pt-1.5 text-[0.68rem]">
                      <span className="text-slate-500">Key Asset: </span>
                      <span className="text-cyan-300 font-semibold">{wallet.topAsset}</span>
                    </div>
                  </div>

                  <p className="text-[0.72rem] text-slate-400 line-clamp-2">
                    {wallet.description}
                  </p>
                </div>

                {/* Inspect Button */}
                <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                  <span className="font-mono text-[0.65rem] text-slate-500">
                    {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                  </span>

                  <button
                    type="button"
                    onClick={() => onSelectAddress(wallet.address)}
                    className="flex items-center gap-1 rounded-lg bg-cyan-400/15 border border-cyan-400/30 px-2.5 py-1 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/30"
                  >
                    <Search className="h-3 w-3" />
                    <span>Inspect in MyVerse</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. Live Whale Swap Feed (ElectroSwap V2 Router) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800/80 pt-6">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-rose-500 animate-pulse" />
            <h3 className="text-base font-bold text-white">Live Whale Swap Feed</h3>
            <span className="rounded bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-rose-400">
              LIVE
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.68rem] text-slate-500">
              Source: ElectroSwap Router
            </span>

            <button
              type="button"
              disabled={refreshing}
              onClick={() => loadSwaps(true)}
              className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-xs text-slate-400 hover:border-slate-700 hover:text-slate-200 transition disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin text-cyan-400")} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {loadingSwaps && swaps.length === 0 ? (
          <div className="space-y-2 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-slate-900/60" />
            ))}
          </div>
        ) : swaps.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
            No live swaps recorded on ElectroSwap Router recently.
          </div>
        ) : (
          <div className="space-y-2">
            {swaps.map((swap) => {
              const isBuy = swap.action === "BUY";

              return (
                <div
                  key={swap.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 text-xs transition duration-200 hover:border-slate-700"
                >
                  {/* Left: Trader & Time */}
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "rounded px-2 py-1 font-mono text-[0.65rem] font-bold uppercase",
                        isBuy
                          ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-950/50 text-rose-400 border border-rose-500/30"
                      )}
                    >
                      {swap.action}
                    </span>

                    <div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSelectAddress(swap.walletAddress)}
                          className="font-bold text-slate-200 hover:text-cyan-300 transition text-left"
                        >
                          {swap.walletLabel}
                        </button>
                        {swap.isLargeWhale && (
                          <span className="flex items-center gap-0.5 rounded bg-amber-400/10 border border-amber-400/30 px-1 py-0.2 text-[0.55rem] font-bold text-amber-300">
                            <Crown className="h-2 w-2" />
                            WHALE
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-[0.65rem] text-slate-500">
                        {swap.timeAgo} ·{" "}
                        <a
                          href={`${ETN_EXPLORER_URL}/tx/${swap.txHash}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="hover:text-cyan-300 transition underline underline-offset-2"
                        >
                          {swap.txHash.slice(0, 8)}...{swap.txHash.slice(-6)}
                        </a>
                      </p>
                    </div>
                  </div>

                  {/* Middle: Swap Details */}
                  <div className="font-mono text-xs text-slate-300">
                    <span className="text-slate-400">Swapped </span>
                    <span className="font-semibold text-slate-200">
                      {swap.tokenIn.amount} {swap.tokenIn.symbol}
                    </span>
                    <span className="text-slate-500"> → </span>
                    <span className="font-bold text-cyan-300">
                      {swap.tokenOut.amount} {swap.tokenOut.symbol}
                    </span>
                  </div>

                  {/* Right: USD Value & Copy Trade Link */}
                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="text-right font-mono">
                      <p className="font-bold text-slate-200">
                        ${swap.valueUsd.toFixed(2)} USD
                      </p>
                      <p className="text-[0.62rem] text-slate-500">
                        {swap.valueEtn.toFixed(2)} ETN
                      </p>
                    </div>

                    <Link
                      href={`/swap?outputCurrency=${swap.tokenOut.symbol === "ETN" ? "0x138DAFbDA0CCB3d8E39C19edb0510Fc31b7C1c77" : "0x0000000000000000000000000000000000000000"}`}
                      className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-300 transition hover:border-cyan-400/60 hover:bg-cyan-500/20 shadow-sm"
                      title="Copy trade on PulseSwap"
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                      <span className="hidden sm:inline">Copy Trade</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
