"use client";

import { useMemo } from "react";
import { ArrowLeftRight, CheckCircle2, Coins, ExternalLink, Filter, HelpCircle } from "lucide-react";
import Link from "next/link";

import { DUST_THRESHOLD_USD } from "@/lib/constants/myverse";
import { ETN_EXPLORER_URL } from "@/lib/etn";
import type { TokenHolding } from "@/lib/portfolio/types";
import { cn } from "@/lib/cn";

interface HoldingsTabProps {
  tokens: TokenHolding[];
  hideDust: boolean;
  onToggleHideDust: () => void;
  loading: boolean;
}

export function HoldingsTab({ tokens, hideDust, onToggleHideDust, loading }: HoldingsTabProps) {
  const displayedTokens = useMemo(() => {
    if (!hideDust) return tokens;
    return tokens.filter((t) => t.isNative || t.totalValueUsd >= DUST_THRESHOLD_USD);
  }, [tokens, hideDust]);

  if (loading && tokens.length === 0) {
    return (
      <div className="space-y-2 py-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-slate-900/60" />
        ))}
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 p-12 text-center">
        <Coins className="h-10 w-10 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-200">No ERC-20 Tokens Found</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-sm">
          This address does not currently hold any fungible tokens on Electroneum Mainnet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Utilities bar: Count & Hide Dust toggle */}
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Showing <span className="font-semibold text-slate-200">{displayedTokens.length}</span> of{" "}
          <span className="font-semibold text-slate-200">{tokens.length}</span> assets
        </span>

        <button
          type="button"
          onClick={onToggleHideDust}
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition duration-200",
            hideDust
              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
              : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
          )}
        >
          <Filter className="h-3 w-3" />
          <span>{hideDust ? "Dust Hidden (< $0.05)" : "Show All Tokens"}</span>
        </button>
      </div>

      {/* Holdings List */}
      <div className="space-y-2">
        {displayedTokens.map((token) => {
          return (
            <div
              key={token.address}
              className="group relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-slate-800/80 bg-slate-900/50 p-4 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/80"
            >
              {/* Token Identity */}
              <div className="flex items-center gap-3 min-w-0 sm:w-1/3">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-950 font-bold text-cyan-300 text-xs shadow-inner">
                  {token.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={token.iconUrl}
                      alt={token.symbol}
                      className="h-7 w-7 rounded-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span>{token.symbol.slice(0, 3)}</span>
                  )}
                  {token.isNative && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-400 text-[0.55rem] font-bold text-slate-950 shadow">
                      ★
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-slate-100">
                      {token.name}
                    </span>
                    {token.isVerified && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">{token.symbol}</span>
                    <span>·</span>
                    <a
                      href={`${ETN_EXPLORER_URL}/token/${token.address}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-mono text-[0.68rem] text-slate-500 hover:text-cyan-300 transition"
                    >
                      {token.isNative ? "Native Coin" : `${token.address.slice(0, 6)}...${token.address.slice(-4)}`}
                    </a>
                  </div>
                </div>
              </div>

              {/* Price & Balance */}
              <div className="flex items-center justify-between sm:justify-center gap-6 sm:w-1/3">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Balance</p>
                  <p className="font-mono text-sm font-bold text-slate-200">
                    {token.balanceFormatted}
                  </p>
                </div>

                <div>
                  <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Live Price</p>
                  <p className="font-mono text-xs font-semibold text-slate-300">
                    {token.priceInUsd > 0
                      ? `$${token.priceInUsd.toFixed(token.priceInUsd < 0.01 ? 6 : 4)}`
                      : "—"}
                  </p>
                  <p className="font-mono text-[0.62rem] text-slate-500">
                    {token.priceInEtn > 0 ? `${token.priceInEtn.toFixed(4)} ETN` : "No Pool"}
                  </p>
                </div>
              </div>

              {/* Total Value, Allocation & Quick Swap Action */}
              <div className="flex items-center justify-between sm:justify-end gap-4 sm:w-1/3">
                <div className="text-right">
                  <p className="font-mono text-sm font-extrabold text-slate-100">
                    ${token.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>

                  {/* Allocation Progress Bar */}
                  <div className="mt-1 flex items-center justify-end gap-1.5">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(1, token.allocationPercent))}%` }}
                      />
                    </div>
                    <span className="font-mono text-[0.62rem] text-slate-400">
                      {token.allocationPercent}%
                    </span>
                  </div>
                </div>

                {/* Quick Swap on PulseSwap Button */}
                <Link
                  href={
                    token.isNative
                      ? "/swap"
                      : `/swap?inputCurrency=${token.address}`
                  }
                  title={`Swap ${token.symbol} on PulseSwap`}
                  className="flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-300 transition hover:border-cyan-400/60 hover:bg-cyan-500/20"
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  <span className="hidden sm:inline">Swap</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
