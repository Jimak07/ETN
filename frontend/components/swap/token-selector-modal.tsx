"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Coins,
  ExternalLink,
  Flame,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress, type Address } from "viem";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { CANONICAL_ECOSYSTEM_SYMBOLS, DEFAULT_ECOSYSTEM_TOKENS, type TokenInfo } from "@/lib/constants/electroswap";
import { ETN_MAINNET } from "@/lib/etn";
import { getReadClient } from "@/lib/multi-sender/contract";
import { verifyOnChainToken } from "@/lib/swap/tokens";

interface TokenSelectorModalProps {
  open: boolean;
  onClose: () => void;
  tokens: TokenInfo[];
  selectedToken: TokenInfo;
  onSelectToken: (token: TokenInfo) => void;
  onImportToken: (token: TokenInfo) => void;
  userBalances?: Record<string, bigint | null>;
}

export function TokenSelectorModal({
  open,
  onClose,
  tokens,
  selectedToken,
  onSelectToken,
  onImportToken,
  userBalances = {},
}: TokenSelectorModalProps) {
  const reduceMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [discoveredToken, setDiscoveredToken] = useState<TokenInfo | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setSearch("");
      setDiscoveredToken(null);
      setDiscoverError(null);
    }
  }, [open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Filter existing tokens
  const filteredTokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
    );
  }, [tokens, search]);

  // Detect and verify pasted raw contract address
  useEffect(() => {
    const trimmed = search.trim();
    if (!isAddress(trimmed, { strict: false })) {
      setDiscoveredToken(null);
      setDiscoverError(null);
      return;
    }

    // Check if token already exists in list
    const exists = tokens.some(
      (t) => t.address.toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      setDiscoveredToken(null);
      setDiscoverError(null);
      return;
    }

    let cancelled = false;
    setVerifying(true);
    setDiscoverError(null);

    const client = getReadClient(ETN_MAINNET.id);
    if (!client) {
      setVerifying(false);
      return;
    }

    void (async () => {
      try {
        const token = await verifyOnChainToken(trimmed, client);
        if (cancelled) return;
        if (token) {
          setDiscoveredToken(token);
          setDiscoverError(null);
        } else {
          setDiscoveredToken(null);
          setDiscoverError("No valid ERC-20 token contract found at this address.");
        }
      } catch {
        if (!cancelled) {
          setDiscoveredToken(null);
          setDiscoverError("Failed to query token metadata on-chain.");
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [search, tokens]);

  const handleSelect = (token: TokenInfo) => {
    onSelectToken(token);
    onClose();
  };

  const handleImport = (token: TokenInfo) => {
    onImportToken(token);
    onSelectToken(token);
    onClose();
  };

  const quickPickTokens = useMemo(() => {
    return DEFAULT_ECOSYSTEM_TOKENS.slice(0, 4);
  }, []);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="token-selector-backdrop"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            key="token-selector-dialog"
            initial={reduceMotion ? false : { scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl"
          >
            {/* Top ambient highlight line */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent pointer-events-none" />

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-100">Select a Token</h3>
                <p className="text-xs text-slate-400">Search by name or paste contract address</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 pb-2 space-y-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  type="text"
                  placeholder="Search name or paste 0x address..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  className="pl-10 h-10 border-slate-800 bg-slate-950/80 text-xs placeholder:text-slate-600 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 font-mono"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              {/* Quick Pick Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {quickPickTokens.map((t) => {
                  const isSelected = t.address.toLowerCase() === selectedToken.address.toLowerCase();
                  return (
                    <button
                      key={t.symbol}
                      type="button"
                      onClick={() => handleSelect(t)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                        isSelected
                          ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-200"
                          : "border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800/50"
                      )}
                    >
                      <span className="font-semibold">{t.symbol}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Discovered Custom Token Card (When pasting a 0x address) */}
            {verifying ? (
              <div className="mx-4 my-2 flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                <span>Verifying contract on Electroneum node...</span>
              </div>
            ) : discoveredToken ? (
              <div className="mx-4 my-2 rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-flex items-center gap-1 rounded bg-cyan-500/20 px-1.5 py-0.5 text-[0.62rem] font-medium text-cyan-300 uppercase tracking-wider">
                      <Sparkles className="h-2.5 w-2.5" /> Verified On-Chain
                    </span>
                    <h4 className="mt-1 text-sm font-semibold text-slate-100">
                      {discoveredToken.name} ({discoveredToken.symbol})
                    </h4>
                    <p className="font-mono text-[0.65rem] text-slate-400 break-all">
                      {discoveredToken.address}
                    </p>
                    <p className="text-[0.65rem] text-slate-500 mt-0.5">
                      Decimals: {discoveredToken.decimals}
                    </p>
                  </div>
                </div>

                {CANONICAL_ECOSYSTEM_SYMBOLS.has(discoveredToken.symbol.toUpperCase()) ? (
                  <div className="rounded-lg border border-rose-500/50 bg-rose-950/40 p-2.5 text-[0.68rem] text-rose-200 leading-relaxed space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-rose-300">
                      <ShieldAlert className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      <span>Critical Warning: Symbol Impersonation!</span>
                    </div>
                    <p>
                      This custom contract uses the symbol <strong>{discoveredToken.symbol}</strong>, which matches an official ecosystem asset. Confirm this address on Blockscout before proceeding!
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-2 text-[0.68rem] text-amber-300/90 leading-relaxed">
                    Anyone can create an ERC-20 token on Electroneum. Always verify the contract address before trading.
                  </div>
                )}

                <Button
                  type="button"
                  onClick={() => handleImport(discoveredToken)}
                  className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300 font-semibold text-xs h-8 shadow-glow"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Import Token
                </Button>
              </div>
            ) : discoverError ? (
              <div className="mx-4 my-2 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                <span>{discoverError}</span>
              </div>
            ) : null}

            {/* Token List */}
            <div className="mt-2 flex-1 max-h-72 overflow-y-auto px-2 pb-3">
              <div className="px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-500">
                Token List ({filteredTokens.length})
              </div>

              {filteredTokens.length === 0 && !discoveredToken ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No tokens matching &ldquo;{search}&rdquo;
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredTokens.map((token) => {
                    const isSelected =
                      token.address.toLowerCase() === selectedToken.address.toLowerCase();
                    const rawBalance = userBalances[token.address.toLowerCase()];
                    const formattedBalance =
                      rawBalance !== undefined && rawBalance !== null
                        ? Number(formatUnits(rawBalance, token.decimals)).toLocaleString(undefined, {
                            maximumFractionDigits: 4,
                          })
                        : null;

                    return (
                      <button
                        key={token.address + token.symbol}
                        type="button"
                        onClick={() => handleSelect(token)}
                        className={cn(
                          "w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left transition",
                          isSelected
                            ? "bg-cyan-500/15 border border-cyan-500/30"
                            : "hover:bg-slate-800/60 border border-transparent"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/80 text-xs font-bold text-cyan-300 shadow-inner">
                            {token.symbol.slice(0, 3)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-xs text-slate-100">
                                {token.symbol}
                              </span>
                              {token.isNative ? (
                                <span className="rounded bg-cyan-950 px-1 py-0.2 text-[0.6rem] font-medium text-cyan-400 border border-cyan-500/30">
                                  Native
                                </span>
                              ) : token.isCustom ? (
                                CANONICAL_ECOSYSTEM_SYMBOLS.has(token.symbol.toUpperCase()) ? (
                                  <span className="rounded bg-rose-950 px-1 py-0.2 text-[0.6rem] font-medium text-rose-300 border border-rose-500/40">
                                    ⚠️ Impersonation Risk
                                  </span>
                                ) : (
                                  <span className="rounded bg-amber-950 px-1 py-0.2 text-[0.6rem] font-medium text-amber-400 border border-amber-500/30">
                                    Unverified
                                  </span>
                                )
                              ) : null}
                            </div>
                            <p className="truncate text-[0.68rem] text-slate-400">
                              {token.name}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 pl-2">
                          {formattedBalance !== null ? (
                            <span className="font-mono text-xs text-slate-200">
                              {formattedBalance}
                            </span>
                          ) : null}
                          {isSelected ? (
                            <Check className="ml-auto h-3.5 w-3.5 text-cyan-400 mt-0.5" />
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-800/80 bg-slate-950/50 px-4 py-2.5 text-center text-[0.68rem] text-slate-500 flex items-center justify-between">
              <span>Tokens indexed via Electroneum Blockscout</span>
              <a
                href={ETN_MAINNET.explorerUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition"
              >
                Explorer <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
