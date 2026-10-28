"use client";

import { Suspense, useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Coins,
  Compass,
  Crown,
  Eye,
  Image as ImageIcon,
  Layers,
  Loader2,
  Radar,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  User,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getAddress, isAddress, type Address } from "viem";

import { AddressSearchBar } from "@/components/portfolio/address-search-bar";
import { DefiTab } from "@/components/portfolio/defi-tab";
import { HoldingsTab } from "@/components/portfolio/holdings-tab";
import { IntelligenceTab } from "@/components/portfolio/intelligence-tab";
import { NftTab } from "@/components/portfolio/nft-tab";
import { PortfolioHeader } from "@/components/portfolio/portfolio-header";
import { SmartMoneyTab } from "@/components/portfolio/smart-money-tab";
import { WatchlistBar } from "@/components/portfolio/watchlist-bar";
import { usePortfolio } from "@/hooks/use-portfolio";
import { DEFAULT_EXPLORER_ADDRESS, IS_PREMIUM_USER } from "@/lib/constants/myverse";
import { exportTaxLedgerCsv } from "@/lib/portfolio/export-csv";
import { cn } from "@/lib/cn";

type PortfolioViewMode = "portfolio" | "explorer";
type ActiveTab = "holdings" | "defi" | "nfts" | "intelligence" | "smart-money";

function PortfolioPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const addressParam = searchParams.get("address");
  const modeParam = searchParams.get("mode");

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
    account,
    connectWallet,
    isWhaleMode,
    isBundleMode,
    selectedBundleAddresses,
    toggleBundleMode,
    toggleSelectBundleAddress,
    selectAllBundleAddresses,
    clearBundleAddresses,
    revokingSpender,
    batchRevoking,
    revokeProgress,
    revokeAllowance,
    batchRevokeAllowances,
  } = usePortfolio(addressParam || undefined);

  // Top-Level Mode: "portfolio" (Personal) vs "explorer" (External Tracking)
  const [viewMode, setViewMode] = useState<PortfolioViewMode>(() => {
    if (modeParam === "explorer" || (addressParam && isAddress(addressParam))) {
      return "explorer";
    }
    return "portfolio";
  });

  const [activeTab, setActiveTab] = useState<ActiveTab>("holdings");

  // Sync mode and address when searchParams change
  useEffect(() => {
    if (addressParam && isAddress(addressParam)) {
      const checksum = getAddress(addressParam);
      selectAddress(checksum);
      setViewMode("explorer");
    } else if (modeParam === "explorer") {
      setViewMode("explorer");
    } else if (modeParam === "portfolio") {
      setViewMode("portfolio");
    }
  }, [addressParam, modeParam, selectAddress]);

  // Handler: Switch to Personal Portfolio Mode
  const switchToPortfolioMode = () => {
    setViewMode("portfolio");
    if (account) {
      selectAddress(account);
    }
    router.replace("/portfolio?mode=portfolio", { scroll: false });
  };

  // Handler: Switch to External Explorer Mode
  const switchToExplorerMode = (externalAddr?: string) => {
    setViewMode("explorer");
    const nextAddr = externalAddr || (targetAddress && targetAddress !== account ? targetAddress : DEFAULT_EXPLORER_ADDRESS);
    selectAddress(nextAddr);
    router.replace(`/portfolio?address=${nextAddr}&mode=explorer`, { scroll: false });
  };

  // Determine whether we are viewing an external wallet in Explorer mode
  const isViewingExternal =
    viewMode === "explorer" &&
    (!account || targetAddress.toLowerCase() !== account.toLowerCase());

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="space-y-6">
        {/* Navigation Breadcrumb & Top Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to ETNVerse Hub
          </Link>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Direct Link to In-App Token Holders Leaderboard */}
            <Link
              href="/portfolio/leaderboard"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition shadow-sm"
            >
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
              <span>Token Leaderboard</span>
            </Link>

            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin text-cyan-400")} />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 1. TOP-LEVEL MODE SWITCHER: "My Portfolio" vs "Whale & Wallet Explorer"  */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-1.5 shadow-2xl backdrop-blur-xl">
          <button
            type="button"
            onClick={switchToPortfolioMode}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs sm:text-sm font-bold transition-all duration-200",
              viewMode === "portfolio"
                ? "bg-gradient-to-r from-cyan-500/25 via-cyan-400/20 to-blue-500/20 border border-cyan-400/40 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            )}
          >
            <User className="h-4 w-4 shrink-0" />
            <span>My Portfolio</span>
            {account && (
              <span className="hidden sm:inline font-mono text-[0.68rem] text-slate-400">
                ({account.slice(0, 4)}...{account.slice(-3)})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => switchToExplorerMode()}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-xs sm:text-sm font-bold transition-all duration-200",
              viewMode === "explorer"
                ? "bg-gradient-to-r from-cyan-500/25 via-cyan-400/20 to-blue-500/20 border border-cyan-400/40 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.25)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
            )}
          >
            <Compass className="h-4 w-4 text-amber-400 shrink-0" />
            <span>Whale &amp; Wallet Explorer</span>
            {IS_PREMIUM_USER && (
              <span className="hidden sm:inline rounded bg-amber-400/20 border border-amber-400/40 px-1.5 py-0.2 text-[0.58rem] font-bold uppercase tracking-wider text-amber-300">
                PRO
              </span>
            )}
          </button>
        </div>

        {/* ========================================================================= */}
        {/* MODE A: MY PORTFOLIO (Clean Personal Dashboard)                           */}
        {/* ========================================================================= */}
        {viewMode === "portfolio" && (
          <>
            {!account ? (
              /* If wallet is not connected, show clean connection prompt */
              <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/40 p-8 sm:p-14 text-center shadow-2xl backdrop-blur-md space-y-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 shadow-[0_0_25px_rgba(34,211,238,0.25)]">
                  <Wallet className="h-8 w-8" />
                </div>

                <div className="space-y-1.5 max-w-md">
                  <h2 className="text-xl font-extrabold text-white">
                    Connect Wallet to View Your Portfolio
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Connect your Web3 wallet (MetaMask, Rabby, or Coinbase) to inspect your personal ETN balance, ERC-20 tokens, ElectroSwap LP positions, and revoke risky allowances.
                  </p>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={connectWallet}
                    className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-glow transition hover:bg-cyan-300"
                  >
                    <Wallet className="h-4 w-4" />
                    <span>Connect Wallet</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => switchToExplorerMode()}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:border-slate-700 hover:text-white transition"
                  >
                    <Compass className="h-4 w-4 text-amber-400" />
                    <span>Explore Ecosystem Whales &rarr;</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Connected Personal Dashboard */
              <div className="space-y-6">
                {/* Watchlist Bar for Fast Switching & Multi-Wallet Bundle Mode */}
                {watchlist.length > 0 && (
                  <WatchlistBar
                    watchlist={watchlist}
                    activeAddress={targetAddress}
                    onSelect={selectAddress}
                    onRemove={(addr) => {
                      if (addr.toLowerCase() === targetAddress.toLowerCase()) {
                        toggleWatchlist();
                      }
                    }}
                    isBundleMode={isBundleMode}
                    selectedBundleAddresses={selectedBundleAddresses}
                    onToggleBundleMode={toggleBundleMode}
                    onToggleSelectBundle={toggleSelectBundleAddress}
                    onSelectAllBundle={selectAllBundleAddresses}
                    onClearBundle={clearBundleAddresses}
                  />
                )}

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

                {/* 4 Focused Personal Tabs (No Smart Money clutter in personal view) */}
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
                      <span>Intelligence &amp; Revoke Shield</span>
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
                        bestPerformer={summary?.bestPerformer}
                        worstPerformer={summary?.worstPerformer}
                        isBundle={summary?.isBundle}
                      />
                    )}

                    {activeTab === "defi" && (
                      <DefiTab
                        positions={summary?.defiPositions ?? []}
                        loading={loading}
                        isBundle={summary?.isBundle}
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
                        canRevoke={!isBundleMode && Boolean(account)}
                        revokingSpender={revokingSpender}
                        batchRevoking={batchRevoking}
                        revokeProgress={revokeProgress}
                        onRevoke={revokeAllowance}
                        onBatchRevoke={batchRevokeAllowances}
                        onExportTaxLedger={() => {
                          if (summary) {
                            exportTaxLedgerCsv(summary, summary.intelligence?.recentTransactions ?? []);
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* MODE B: WHALE & WALLET EXPLORER (External Tracking & Radar)               */}
        {/* ========================================================================= */}
        {viewMode === "explorer" && (
          <div className="space-y-6">
            {/* Top 50 Token Holders Leaderboard CTA Header Card */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-orange-500/10 p-4 shadow-lg">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">
                    Top 50 Token Holders &amp; Whale Leaderboards
                  </h3>
                  <span className="rounded bg-amber-400/20 border border-amber-400/40 px-1.5 py-0.2 text-[0.55rem] font-bold text-amber-300 uppercase">
                    IN-APP
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Inspect real-time token holder distributions for Native ETN, BOLT, WETN, and 50+ ecosystem tokens without external Blockscout redirects.
                </p>
              </div>

              <Link
                href="/portfolio/leaderboard"
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-300 shadow-glow shrink-0 self-start sm:self-auto"
              >
                <span>Inspect Token Leaderboards</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {/* External Wallet Viewing Banner */}
            {isViewingExternal && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3.5 text-xs shadow-md">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span className="text-slate-300">Viewing External Wallet:</span>
                  <span className="font-mono font-bold text-cyan-300">
                    {targetAddress.slice(0, 8)}...{targetAddress.slice(-6)}
                  </span>
                  {summary?.isContract && (
                    <span className="rounded bg-purple-500/20 border border-purple-500/30 px-1.5 py-0.2 text-[0.6rem] text-purple-300 font-mono">
                      Contract
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={switchToPortfolioMode}
                  className="inline-flex items-center gap-1 font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-2 self-start sm:self-auto"
                >
                  <span>&larr; Back to My Portfolio</span>
                </button>
              </div>
            )}

            {/* Address Search Bar & Presets */}
            <AddressSearchBar
              currentAddress={targetAddress}
              onSearch={(addr) => selectAddress(addr)}
              isWatchlisted={isWatchlisted}
              onToggleWatchlist={toggleWatchlist}
              isWhaleMode={isWhaleMode}
              isContract={summary?.isContract}
            />

            {/* Watchlist Bar for Fast Switching & Multi-Wallet Bundle Mode */}
            <WatchlistBar
              watchlist={watchlist}
              activeAddress={targetAddress}
              onSelect={selectAddress}
              onRemove={(addr) => {
                if (addr.toLowerCase() === targetAddress.toLowerCase()) {
                  toggleWatchlist();
                }
              }}
              isBundleMode={isBundleMode}
              selectedBundleAddresses={selectedBundleAddresses}
              onToggleBundleMode={toggleBundleMode}
              onToggleSelectBundle={toggleSelectBundleAddress}
              onSelectAllBundle={selectAllBundleAddresses}
              onClearBundle={clearBundleAddresses}
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

            {/* 5 Explorer Tabs (Includes Smart Money Radar) */}
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

                <button
                  type="button"
                  onClick={() => setActiveTab("smart-money")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 shrink-0",
                    activeTab === "smart-money"
                      ? "bg-cyan-400 text-slate-950 shadow-glow"
                      : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
                  )}
                >
                  <Radar className="h-3.5 w-3.5 text-rose-400" />
                  <span>Smart Money Radar</span>
                  {IS_PREMIUM_USER && (
                    <span
                      className={cn(
                        "rounded px-1 py-0.2 text-[0.55rem] font-bold uppercase",
                        activeTab === "smart-money"
                          ? "bg-slate-950 text-cyan-300"
                          : "bg-cyan-400/20 text-cyan-300 border border-cyan-400/40"
                      )}
                    >
                      PRO
                    </span>
                  )}
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
                    bestPerformer={summary?.bestPerformer}
                    worstPerformer={summary?.worstPerformer}
                    isBundle={summary?.isBundle}
                  />
                )}

                {activeTab === "defi" && (
                  <DefiTab
                    positions={summary?.defiPositions ?? []}
                    loading={loading}
                    isBundle={summary?.isBundle}
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
                    canRevoke={!isWhaleMode && !isBundleMode && Boolean(account)}
                    revokingSpender={revokingSpender}
                    batchRevoking={batchRevoking}
                    revokeProgress={revokeProgress}
                    onRevoke={revokeAllowance}
                    onBatchRevoke={batchRevokeAllowances}
                    onExportTaxLedger={() => {
                      if (summary) {
                        exportTaxLedgerCsv(summary, summary.intelligence?.recentTransactions ?? []);
                      }
                    }}
                  />
                )}

                {activeTab === "smart-money" && (
                  <SmartMoneyTab
                    etnUsdPrice={summary?.etnUsdPrice ?? 0.00213}
                    onSelectAddress={selectAddress}
                  />
                )}
              </div>
            </div>
          </div>
        )}

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

export default function PortfolioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <PortfolioPageContent />
    </Suspense>
  );
}
