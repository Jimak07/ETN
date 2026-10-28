"use client";

import { useState } from "react";
import {
  Activity,
  ArrowLeft,
  Coins,
  Image as ImageIcon,
  Layers,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { AddressSearchBar } from "@/components/portfolio/address-search-bar";
import { DefiTab } from "@/components/portfolio/defi-tab";
import { HoldingsTab } from "@/components/portfolio/holdings-tab";
import { IntelligenceTab } from "@/components/portfolio/intelligence-tab";
import { NftTab } from "@/components/portfolio/nft-tab";
import { PortfolioHeader } from "@/components/portfolio/portfolio-header";
import { WatchlistBar } from "@/components/portfolio/watchlist-bar";
import { usePortfolio } from "@/hooks/use-portfolio";
import { cn } from "@/lib/cn";

type ActiveTab = "holdings" | "defi" | "nfts" | "intelligence";

export default function PortfolioPage() {
  const {
    targetAddress,
    summary,
    loading,
    refreshing,
    error,
    timeframe,
    setTimeframe,
    hideDust,
    toggleHideDust,
    watchlist,
    isWatchlisted,
    toggleWatchlist,
    selectAddress,
    refresh,
    isWhaleMode,
  } = usePortfolio();

  const [activeTab, setActiveTab] = useState<ActiveTab>("holdings");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="space-y-6">
        {/* Navigation Breadcrumb & Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to ETNVerse Hub
          </Link>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin text-cyan-400")} />
              <span>{refreshing ? "Refreshing..." : "Refresh Telemetry"}</span>
            </button>
          </div>
        </div>

        {/* Search Bar & Address Watch Status */}
        <AddressSearchBar
          currentAddress={targetAddress}
          onSearch={selectAddress}
          isWatchlisted={isWatchlisted}
          onToggleWatchlist={toggleWatchlist}
          isWhaleMode={isWhaleMode}
          isContract={summary?.isContract}
        />

        {/* Watchlist Bar for Fast Switching */}
        <WatchlistBar
          watchlist={watchlist}
          activeAddress={targetAddress}
          onSelect={selectAddress}
          onRemove={(addr) => {
            if (addr.toLowerCase() === targetAddress.toLowerCase()) {
              toggleWatchlist();
            }
          }}
        />

        {/* Error Alert Banner */}
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 text-xs text-rose-300">
            <strong>Telemetry Error:</strong> {error}
          </div>
        )}

        {/* Net Worth Header & Interactive Chart */}
        <PortfolioHeader
          summary={summary}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          loading={loading}
        />

        {/* 4 Clean Tabs */}
        <div className="space-y-4">
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-800 pb-2 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab("holdings")}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 shrink-0",
                activeTab === "holdings"
                  ? "bg-cyan-400 text-slate-950 shadow-glow"
                  : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
              )}
            >
              <Coins className="h-3.5 w-3.5" />
              <span>Holdings ({summary?.tokens.length ?? 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("defi")}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 shrink-0",
                activeTab === "defi"
                  ? "bg-cyan-400 text-slate-950 shadow-glow"
                  : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>DeFi Positions ({summary?.defiPositions.length ?? 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("nfts")}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 shrink-0",
                activeTab === "nfts"
                  ? "bg-cyan-400 text-slate-950 shadow-glow"
                  : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
              )}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>NFTs ({summary?.nfts.length ?? 0})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("intelligence")}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 shrink-0",
                activeTab === "intelligence"
                  ? "bg-cyan-400 text-slate-950 shadow-glow"
                  : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Intelligence &amp; Approvals</span>
            </button>
          </div>

          {/* Active Tab View */}
          <div className="pt-2">
            {activeTab === "holdings" && (
              <HoldingsTab
                tokens={summary?.tokens ?? []}
                hideDust={hideDust}
                onToggleHideDust={toggleHideDust}
                loading={loading}
              />
            )}

            {activeTab === "defi" && (
              <DefiTab
                positions={summary?.defiPositions ?? []}
                loading={loading}
              />
            )}

            {activeTab === "nfts" && (
              <NftTab
                nfts={summary?.nfts ?? []}
                loading={loading}
              />
            )}

            {activeTab === "intelligence" && (
              <IntelligenceTab
                intelligence={
                  summary?.intelligence ?? {
                    totalTransactions: 0,
                    tokenTransfersCount: 0,
                    cumulativeGasSpentEtn: 0,
                    cumulativeGasSpentUsd: 0,
                    walletAgeDays: 0,
                    firstTxDate: null,
                    approvals: [],
                  }
                }
                loading={loading}
              />
            )}
          </div>
        </div>

        {/* Technical Footer */}
        <footer className="flex flex-col gap-1 border-t border-slate-800/80 pt-5 text-[0.7rem] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Real-time on-chain balance, ElectroSwap liquidity pool, and NFT indexing on Electroneum Mainnet.
          </p>
          <p className="font-mono">ETNVerse Hub · MyVerse Portfolio</p>
        </footer>
      </div>
    </main>
  );
}
