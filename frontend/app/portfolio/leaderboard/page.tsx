"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  Crown,
  Droplets,
  ExternalLink,
  Flame,
  Layers,
  LineChart,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isAddress, type Address } from "viem";

import { InfoTooltip, getAddressTypeGlossary, WEB3_GLOSSARY } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/cn";
import { IS_PREMIUM_USER } from "@/lib/constants/myverse";
import { ETN_EXPLORER_URL } from "@/lib/etn";
import { sanitizeImageUrl } from "@/lib/sanitize";
import {
  fetchCustomTokenByAddress,
  fetchTokenHolders,
  fetchTopEcosystemTokens,
  type LeaderboardSortMode,
  type LeaderboardToken,
  type TokenHolderItem,
} from "@/lib/portfolio/leaderboard";

function formatUsdValue(val: number): string {
  if (val >= 1_000_000_000) return `$${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(2)}K`;
  if (val > 0 && val < 0.0001) return `$${val.toExponential(2)}`;
  if (val > 0 && val < 0.01) return `$${val.toFixed(6)}`;
  return `$${val.toFixed(2)}`;
}

function TokenLeaderboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tokenParam = searchParams.get("token");

  // Tokens state
  const [tokens, setTokens] = useState<LeaderboardToken[]>([]);
  const [selectedToken, setSelectedToken] = useState<LeaderboardToken | null>(null);
  const [tokensLoading, setTokensLoading] = useState<boolean>(true);
  const [refreshingRankings, setRefreshingRankings] = useState<boolean>(false);
  const [sortMode, setSortMode] = useState<LeaderboardSortMode>("market-cap");
  const [showAllTokens, setShowAllTokens] = useState<boolean>(false);
  const [tokenSearchQuery, setTokenSearchQuery] = useState<string>("");

  // Custom 0x lookup state
  const [customLoading, setCustomLoading] = useState<boolean>(false);
  const [customLookupError, setCustomLookupError] = useState<string | null>(null);

  // Holders state
  const [holders, setHolders] = useState<TokenHolderItem[]>([]);
  const [holdersLoading, setHoldersLoading] = useState<boolean>(true);
  const [holderSearchQuery, setHolderSearchQuery] = useState<string>("");
  const [refreshingHolders, setRefreshingHolders] = useState<boolean>(false);

  // Pagination state (25 or 50)
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Copy feedback state
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // 1. Fetch Top Ecosystem Tokens on Mount and when sortMode changes
  const loadTokens = async (mode: LeaderboardSortMode, refresh = false) => {
    if (refresh) setRefreshingRankings(true);
    else setTokensLoading(true);

    try {
      const list = await fetchTopEcosystemTokens(mode, refresh);
      setTokens(list);

      // Preserve currently selected token if still present, or pre-select from URL, or default to #1 (Native ETN)
      setSelectedToken((prev) => {
        if (tokenParam) {
          const match = list.find(
            (t) => t.address.toLowerCase() === tokenParam.toLowerCase()
          );
          if (match) return match;
        }
        if (prev) {
          const stillExists = list.find(
            (t) => t.address.toLowerCase() === prev.address.toLowerCase()
          );
          if (stillExists) return stillExists;
        }
        return list.length > 0 ? list[0] : null;
      });
    } catch (err) {
      console.error("Failed to load tokens:", err);
    } finally {
      setTokensLoading(false);
      setRefreshingRankings(false);
    }
  };

  useEffect(() => {
    void loadTokens(sortMode, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode]);

  // 2. Fetch Holders when Selected Token Changes
  const loadHolders = async (token: LeaderboardToken, isRefresh = false) => {
    if (isRefresh) setRefreshingHolders(true);
    else setHoldersLoading(true);

    try {
      const data = await fetchTokenHolders(token, token.priceInUsd);
      setHolders(data);
      setCurrentPage(1);
    } catch (err) {
      console.error("Failed to load holders:", err);
    } finally {
      setHoldersLoading(false);
      setRefreshingHolders(false);
    }
  };

  useEffect(() => {
    if (selectedToken) {
      void loadHolders(selectedToken, false);
    }
  }, [selectedToken]);

  const handleSelectToken = (token: LeaderboardToken) => {
    setSelectedToken(token);
    router.replace(`/portfolio/leaderboard?token=${token.address}`, { scroll: false });
  };

  // 3. Handle Custom 0x Address On-Chain Lookup
  const handleLookupCustomToken = async (targetAddress: Address) => {
    setCustomLoading(true);
    setCustomLookupError(null);
    try {
      const liveEtnPrice = tokens[0]?.priceInUsd || 0.002;
      const customToken = await fetchCustomTokenByAddress(targetAddress, liveEtnPrice);
      if (customToken) {
        // Prepend to tokens list if not already present
        setTokens((prev) => {
          const exists = prev.some(
            (t) => t.address.toLowerCase() === customToken.address.toLowerCase()
          );
          if (exists) return prev;
          return [customToken, ...prev];
        });
        handleSelectToken(customToken);
        setTokenSearchQuery("");
      } else {
        setCustomLookupError("No contract or ERC-20 metadata found at this address.");
      }
    } catch (err) {
      console.error("Failed to lookup custom token:", err);
      setCustomLookupError("Failed to fetch on-chain token. Please verify the address.");
    } finally {
      setCustomLoading(false);
    }
  };

  // Filtered Tokens for Selector / Grid
  const filteredTokens = useMemo(() => {
    if (!tokenSearchQuery.trim()) return tokens;
    const query = tokenSearchQuery.toLowerCase().trim();
    return tokens.filter(
      (t) =>
        t.name.toLowerCase().includes(query) ||
        t.symbol.toLowerCase().includes(query) ||
        t.address.toLowerCase().includes(query)
    );
  }, [tokens, tokenSearchQuery]);

  // Detected 0x address in search query not yet in tokens list
  const customAddressQuery = useMemo(() => {
    const trimmed = tokenSearchQuery.trim();
    if (isAddress(trimmed, { strict: false })) {
      const alreadyPresent = tokens.some(
        (t) => t.address.toLowerCase() === trimmed.toLowerCase()
      );
      if (!alreadyPresent) return trimmed as Address;
    }
    return null;
  }, [tokenSearchQuery, tokens]);

  // Tokens to display (Top 12 vs All 50)
  const displayedTokens = useMemo(() => {
    if (tokenSearchQuery.trim()) return filteredTokens;
    if (showAllTokens) return filteredTokens;
    return filteredTokens.slice(0, 12);
  }, [filteredTokens, showAllTokens, tokenSearchQuery]);

  // Filtered Holders for Table
  const filteredHolders = useMemo(() => {
    if (!holderSearchQuery.trim()) return holders;
    const q = holderSearchQuery.toLowerCase().trim();
    return holders.filter(
      (h) =>
        h.address.toLowerCase().includes(q) ||
        (h.contractName && h.contractName.toLowerCase().includes(q))
    );
  }, [holders, holderSearchQuery]);

  // Paginated Holders
  const paginatedHolders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHolders.slice(start, start + pageSize);
  }, [filteredHolders, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredHolders.length / pageSize) || 1;

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-6 lg:px-10 lg:py-12 xl:px-12">
      <div className="space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>&larr; Back to MyVerse</span>
          </Link>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-400 font-mono">
              Electroneum Mainnet (52014)
            </span>
            {IS_PREMIUM_USER && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]">
                <Crown className="h-3 w-3 text-amber-400" />
                PRO LEADERBOARD
              </span>
            )}
          </div>
        </div>

        {/* Page Title & Mission Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                  <Trophy className="h-4 w-4" />
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  Top 50 Token Holders &amp; Whale Leaderboard
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Live, in-app on-chain holder distribution across Native Electroneum (ETN) and the Top 50 ecosystem ERC-20 tokens. Inspect whale positions, liquidity pools, and supply concentration dynamically without leaving MyVerse.
              </p>
            </div>

            {selectedToken && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
                <Link
                  href={
                    selectedToken.isNative
                      ? "/swap"
                      : `/swap?inputCurrency=${selectedToken.address}`
                  }
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-glow transition hover:bg-cyan-300"
                >
                  <Coins className="h-3.5 w-3.5" />
                  <span>Trade {selectedToken.symbol} on PulseSwap</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* 1. Dynamic Top 50 Ecosystem Tokens Engine & Multi-Card Grid */}
        <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 shadow-xl">
          {/* Header Controls: Title, Sort Filter Pill Bar, Refresh, and Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/60 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-slate-100">
                  Select Ecosystem Token ({tokens.length})
                </h2>
              </div>

              {/* Dynamic Sort Filter Pill Bar */}
              <div className="flex items-center rounded-xl border border-slate-800 bg-slate-900/80 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSortMode("market-cap")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                    sortMode === "market-cap"
                      ? "bg-cyan-400 text-slate-950 font-bold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  )}
                  title="Rank tokens by live derived Market Cap (Total Supply × DEX Price)"
                >
                  <Flame className="h-3 w-3" />
                  <span>Market Cap</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSortMode("holders")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                    sortMode === "holders"
                      ? "bg-cyan-400 text-slate-950 font-bold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  )}
                  title="Rank tokens strictly by live on-chain holders count"
                >
                  <Users className="h-3 w-3" />
                  <span>Most Holders</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSortMode("liquidity")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                    sortMode === "liquidity"
                      ? "bg-cyan-400 text-slate-950 font-bold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  )}
                  title="Rank tokens by WETN/USD reserve depth in ElectroSwap V2 pools"
                >
                  <Droplets className="h-3 w-3" />
                  <span>Liquidity Depth</span>
                </button>
              </div>

              {/* Refresh Rankings Button */}
              <button
                type="button"
                disabled={refreshingRankings}
                onClick={() => void loadTokens(sortMode, true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-white transition disabled:opacity-50"
                title="Refresh rankings from live on-chain state"
              >
                <RefreshCw
                  className={cn(
                    "h-3 w-3",
                    refreshingRankings && "animate-spin text-cyan-400"
                  )}
                />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>

            {/* Token Search Bar */}
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={tokenSearchQuery}
                onChange={(e) => {
                  setTokenSearchQuery(e.target.value);
                  setCustomLookupError(null);
                }}
                placeholder="Search symbol, name, or 0x..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Custom 0x Lookup Notification Card if Address not in list */}
          {customAddressQuery && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-3 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400 shrink-0" />
                <span className="text-slate-200">
                  Detected custom contract: <strong className="font-mono text-cyan-300">{customAddressQuery.slice(0, 10)}...{customAddressQuery.slice(-6)}</strong>
                </span>
              </div>
              <button
                type="button"
                disabled={customLoading}
                onClick={() => void handleLookupCustomToken(customAddressQuery)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-1.5 font-bold text-slate-950 shadow transition hover:bg-cyan-300 disabled:opacity-50"
              >
                {customLoading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Loading On-Chain...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-3 w-3" />
                    <span>Inspect Token &amp; Holders</span>
                  </>
                )}
              </button>
            </div>
          )}

          {customLookupError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {customLookupError}
            </div>
          )}

          {/* Tokens Multi-Card Grid */}
          {tokensLoading && tokens.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 py-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl bg-slate-900/60"
                />
              ))}
            </div>
          ) : displayedTokens.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
              No ecosystem tokens match &quot;{tokenSearchQuery}&quot;. Paste a valid 0x address above to load custom tokens.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
              {displayedTokens.map((token) => {
                const isSelected =
                  selectedToken?.address.toLowerCase() === token.address.toLowerCase();

                const isTop1 = token.rank === 1;
                const isTop2 = token.rank === 2;
                const isTop3 = token.rank === 3;

                return (
                  <button
                    key={token.address}
                    type="button"
                    onClick={() => handleSelectToken(token)}
                    className={cn(
                      "flex flex-col justify-between rounded-xl border p-3.5 text-left transition duration-200 relative group",
                      isSelected
                        ? "border-cyan-400/80 bg-cyan-500/15 text-white shadow-[0_0_15px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/50"
                        : "border-slate-800/90 bg-slate-950/70 text-slate-400 hover:border-slate-700 hover:bg-slate-900/80 hover:text-slate-200"
                    )}
                  >
                    {/* Top Row: Dynamic Rank Badge & Primary Metric Pill */}
                    <div className="flex items-center justify-between gap-2 mb-2 w-full">
                      <div className="flex items-center gap-1.5">
                        {isTop1 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-400/20 border border-amber-400/40 px-1.5 py-0.5 text-[0.62rem] font-bold text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)] font-mono">
                            ★ #1
                          </span>
                        ) : isTop2 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-300/20 border border-slate-300/40 px-1.5 py-0.5 text-[0.62rem] font-bold text-slate-200 font-mono">
                            🥈 #2
                          </span>
                        ) : isTop3 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-700/20 border border-amber-700/40 px-1.5 py-0.5 text-[0.62rem] font-bold text-amber-400 font-mono">
                            🥉 #3
                          </span>
                        ) : (
                          <span className="rounded-md bg-slate-800/80 border border-slate-700/60 px-1.5 py-0.5 text-[0.62rem] font-medium text-slate-400 font-mono">
                            #{token.rank}
                          </span>
                        )}

                        {token.isNative && (
                          <InfoTooltip
                            term="Layer-1 Native Coin"
                            definition="Native Layer-1 network asset used to pay validator gas fees for all transactions across the Electroneum Smart Chain."
                            stopPropagation={false}
                          >
                            <span className="rounded bg-amber-400/20 border border-amber-400/30 px-1 py-0.2 text-[0.55rem] font-bold text-amber-300 uppercase tracking-wider cursor-help">
                              L1 Coin
                            </span>
                          </InfoTooltip>
                        )}
                      </div>

                      {/* Metric Tag based on current sort */}
                      <span className="text-[0.62rem] font-mono text-cyan-300 truncate font-semibold">
                        {sortMode === "market-cap" && token.marketCapUsd && token.marketCapUsd > 0
                          ? `MCap ${formatUsdValue(token.marketCapUsd)}`
                          : sortMode === "liquidity" && token.liquidityDepthUsd && token.liquidityDepthUsd > 0
                          ? `Liq ${formatUsdValue(token.liquidityDepthUsd)}`
                          : `${token.holdersCount.toLocaleString()} holders`}
                      </span>
                    </div>

                    {/* Middle Row: Icon & Token Identity */}
                    <div className="flex items-center gap-2.5 my-1">
                      <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 font-bold text-cyan-300 text-xs shadow-inner">
                        {sanitizeImageUrl(token.iconUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={sanitizeImageUrl(token.iconUrl) ?? ""}
                            alt={token.symbol}
                            className="h-6 w-6 rounded-full object-contain"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <span>{token.symbol.slice(0, 3)}</span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition">
                          {token.symbol}
                        </p>
                        <p className="truncate text-[0.68rem] text-slate-400">
                          {token.name}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Row: Holder Count & Price */}
                    <div className="flex items-center justify-between text-[0.62rem] font-mono text-slate-400 border-t border-slate-800/60 pt-2 mt-2">
                      <span className="flex items-center gap-1">
                        <Users className="h-2.5 w-2.5 text-slate-500" />
                        <span>{token.holdersCount.toLocaleString()}</span>
                      </span>

                      <span className="font-semibold text-slate-300">
                        {token.priceInUsd > 0
                          ? formatUsdValue(token.priceInUsd)
                          : "No Pool"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Show Top 12 / View All 50 Toggle Button */}
          {!tokenSearchQuery.trim() && tokens.length > 12 && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setShowAllTokens((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:text-white"
              >
                {showAllTokens ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Show Top 12 Tokens</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5 text-cyan-400" />
                    <span>View All 50 Ecosystem Tokens ({tokens.length})</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 2. Selected Token KPI & Quick Info Card */}
        {selectedToken && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/70 p-5 space-y-4 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Token Identity */}
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 font-bold text-cyan-300 text-sm shadow-md">
                  {sanitizeImageUrl(selectedToken.iconUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={sanitizeImageUrl(selectedToken.iconUrl) ?? ""}
                      alt={selectedToken.symbol}
                      className="h-8 w-8 rounded-full object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span>{selectedToken.symbol.slice(0, 3)}</span>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-extrabold text-white">
                      {selectedToken.name}
                    </h3>
                    <span className="rounded bg-cyan-400/20 border border-cyan-400/30 px-2 py-0.5 text-xs font-bold text-cyan-300 font-mono">
                      {selectedToken.symbol}
                    </span>
                    {selectedToken.rank && (
                      <span className="rounded bg-slate-800 border border-slate-700 px-1.5 py-0.5 text-xs text-slate-400 font-mono font-medium">
                        Rank #{selectedToken.rank}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400">
                    <span className="font-mono text-[0.7rem] text-slate-500">
                      {selectedToken.isNative ? "Native Electroneum Coin" : selectedToken.address}
                    </span>

                    {!selectedToken.isNative && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedToken.address)}
                        className="text-slate-500 hover:text-cyan-300 transition"
                        title="Copy contract address"
                      >
                        {copiedAddress === selectedToken.address ? (
                          <Check className="h-3 w-3 text-emerald-400" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                    )}

                    {!selectedToken.isNative && (
                      <a
                        href={`${ETN_EXPLORER_URL}/token/${selectedToken.address}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-slate-500 hover:text-cyan-300 transition"
                        title="View Token on Blockscout"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <p className="text-[0.6rem] uppercase tracking-wider text-slate-500">Total Supply</p>
                  <p className="font-bold text-slate-200 mt-0.5 truncate">
                    {selectedToken.totalSupplyFormatted} {selectedToken.symbol}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <p className="text-[0.6rem] uppercase tracking-wider text-slate-500">Holders</p>
                  <p className="font-bold text-cyan-300 mt-0.5">
                    {selectedToken.holdersCount.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <p className="text-[0.6rem] uppercase tracking-wider text-slate-500">Price (USD)</p>
                  <p className="font-bold text-slate-200 mt-0.5">
                    {selectedToken.priceInUsd > 0
                      ? formatUsdValue(selectedToken.priceInUsd)
                      : "—"}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                  <p className="text-[0.6rem] uppercase tracking-wider text-slate-500">Market Cap</p>
                  <p className="font-bold text-slate-200 mt-0.5">
                    {selectedToken.marketCapUsd && selectedToken.marketCapUsd > 0
                      ? formatUsdValue(selectedToken.marketCapUsd)
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. In-App Top Holders Table (No Off-Site Redirects) */}
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-bold text-slate-100">
                Top Holders Leaderboard · {selectedToken?.symbol ?? "ETN"}
              </h3>
              <span className="rounded bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[0.62rem] font-semibold text-cyan-300 font-mono">
                {filteredHolders.length} Indexed Whales
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Holder Search Filter */}
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  value={holderSearchQuery}
                  onChange={(e) => {
                    setHolderSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Filter holders (0x...)..."
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/80 pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/50 focus:outline-none transition"
                />
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                disabled={refreshingHolders}
                onClick={() => selectedToken && loadHolders(selectedToken, true)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-700 hover:text-white transition disabled:opacity-50"
                title="Refresh live on-chain holders"
              >
                <RefreshCw
                  className={cn("h-3 w-3", refreshingHolders && "animate-spin text-cyan-400")}
                />
                <span>Refresh</span>
              </button>

              {/* Rows Per Page Toggle */}
              <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/70 p-0.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => {
                    setPageSize(25);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "rounded px-2 py-0.5 transition",
                    pageSize === 25 ? "bg-cyan-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
                  )}
                >
                  25
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPageSize(50);
                    setCurrentPage(1);
                  }}
                  className={cn(
                    "rounded px-2 py-0.5 transition",
                    pageSize === 50 ? "bg-cyan-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
                  )}
                >
                  50
                </button>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {holdersLoading && holders.length === 0 ? (
              <div className="space-y-2 py-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-14 w-full animate-pulse rounded-xl bg-slate-900/60" />
                ))}
              </div>
            ) : filteredHolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 p-12 text-center">
                <Trophy className="h-8 w-8 text-slate-600 mb-2" />
                <p className="text-xs text-slate-400">No token holders found matching your search filter.</p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="pb-3 pl-2 pr-3">Rank</th>
                    <th className="pb-3 px-3">Wallet Address &amp; Tag</th>
                    <th className="pb-3 px-3 text-right">Quantity Held</th>
                    <th className="pb-3 px-3">Supply Share %</th>
                    <th className="pb-3 px-3 text-right">Estimated Value</th>
                    <th className="pb-3 pl-3 pr-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {paginatedHolders.map((holder) => {
                    const isTop1 = holder.rank === 1;
                    const isTop2 = holder.rank === 2;
                    const isTop3 = holder.rank === 3;

                    return (
                      <tr
                        key={holder.address}
                        className="group hover:bg-slate-900/70 transition duration-150"
                      >
                        {/* 1. Rank Badge */}
                        <td className="py-3.5 pl-2 pr-3 font-bold">
                          {isTop1 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 text-xs text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]">
                              🏆 #1
                            </span>
                          ) : isTop2 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-300/20 border border-slate-300/40 px-2 py-0.5 text-xs text-slate-200">
                              🥈 #2
                            </span>
                          ) : isTop3 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-700/20 border border-amber-700/40 px-2 py-0.5 text-xs text-amber-400">
                              🥉 #3
                            </span>
                          ) : (
                            <span className="text-slate-500 pl-1">#{holder.rank}</span>
                          )}
                        </td>

                        {/* 2. Wallet Address & Identity Tag */}
                        <td className="py-3.5 px-3">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-slate-200">
                                {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                              </span>

                              <button
                                type="button"
                                onClick={() => copyToClipboard(holder.address)}
                                className="text-slate-500 hover:text-cyan-300 transition"
                                title="Copy address"
                              >
                                {copiedAddress === holder.address ? (
                                  <Check className="h-3 w-3 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5 text-[0.62rem] font-sans">
                              {(() => {
                                const glossary = getAddressTypeGlossary(
                                  holder.isContract,
                                  holder.contractName,
                                  holder.address
                                );
                                return (
                                  <InfoTooltip
                                    term={glossary.term}
                                    definition={glossary.definition}
                                    showIcon
                                  >
                                    {holder.isContract ? (
                                      <span className="rounded bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.2 font-semibold text-purple-300 hover:border-purple-400 transition cursor-help">
                                        {holder.contractName ?? "Contract / Pool"}
                                      </span>
                                    ) : (
                                      <span className="rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 font-semibold text-emerald-400 hover:border-emerald-300 transition cursor-help">
                                        EOA Wallet
                                      </span>
                                    )}
                                  </InfoTooltip>
                                );
                              })()}
                            </div>
                          </div>
                        </td>

                        {/* 3. Quantity Held */}
                        <td className="py-3.5 px-3 text-right">
                          <p className="font-bold text-slate-100">
                            {holder.balanceFormatted}
                          </p>
                          <p className="text-[0.62rem] text-slate-500 font-sans">
                            {selectedToken?.symbol}
                          </p>
                        </td>

                        {/* 4. Supply Share % Progress Bar */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1 min-w-[120px]">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-cyan-300">
                                {holder.supplySharePercent.toFixed(3)}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, Math.max(1, holder.supplySharePercent))}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* 5. Estimated Value (USD & ETN) */}
                        <td className="py-3.5 px-3 text-right">
                          <p className="font-bold text-slate-100">
                            {holder.valueUsd > 0
                              ? `$${holder.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : "—"}
                          </p>
                          <p className="text-[0.62rem] text-slate-500">
                            {holder.valueEtn > 0
                              ? `${holder.valueEtn.toLocaleString(undefined, { maximumFractionDigits: 2 })} ETN`
                              : "—"}
                          </p>
                        </td>

                        {/* 6. Dual Actions Column */}
                        <td className="py-3.5 pl-3 pr-2 text-right">
                          <div className="flex items-center justify-end gap-1.5 font-sans">
                            {/* Primary In-App Action: Inspect in MyVerse */}
                            <Link
                              href={`/portfolio?address=${holder.address}&mode=explorer`}
                              className="inline-flex items-center gap-1 rounded-lg bg-cyan-400/15 border border-cyan-400/30 px-2.5 py-1 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/30 shadow-sm"
                              title="Inspect this holder's portfolio, PnL & NFTs in MyVerse"
                            >
                              <Search className="h-3 w-3" />
                              <span>Inspect in MyVerse</span>
                            </Link>

                            {/* Secondary External Action: View on Blockscout Explorer */}
                            <a
                              href={`${ETN_EXPLORER_URL}/address/${holder.address}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="p-1 rounded-lg border border-slate-800 text-slate-500 hover:text-cyan-300 hover:border-slate-700 transition"
                              title="View raw address on Blockscout"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-800/60 pt-4 text-xs text-slate-400 font-mono">
              <div>
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, filteredHolders.length)} of{" "}
                {filteredHolders.length} holders
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-800 px-3 py-1 hover:border-slate-700 hover:text-white transition disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 text-slate-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-slate-800 px-3 py-1 hover:border-slate-700 hover:text-white transition disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Technical Footer */}
        <footer className="flex flex-col gap-1 border-t border-slate-800/80 pt-5 text-[0.7rem] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Real-time on-chain token holders and liquidity indexing on Electroneum Mainnet.
          </p>
          <p className="font-mono">ETNVerse Hub · MyVerse Leaderboard</p>
        </footer>
      </div>
    </main>
  );
}

export default function TokenLeaderboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      }
    >
      <TokenLeaderboardContent />
    </Suspense>
  );
}
