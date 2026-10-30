"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, Check, Copy, ExternalLink, Eye, Search, UserCheck } from "lucide-react";
import { isAddress } from "viem";

import { cn } from "@/lib/cn";
import { InfoTooltip, WEB3_GLOSSARY } from "@/components/ui/info-tooltip";
import { ETN_EXPLORER_URL } from "@/lib/etn";

interface AddressSearchBarProps {
  currentAddress: string;
  onSearch: (address: string) => void;
  isWatchlisted: boolean;
  onToggleWatchlist: () => void;
  isWhaleMode: boolean;
  isContract?: boolean;
}

export function AddressSearchBar({
  currentAddress,
  onSearch,
  isWatchlisted,
  onToggleWatchlist,
  isWhaleMode,
  isContract,
}: AddressSearchBarProps) {
  const [inputVal, setInputVal] = useState("");
  const [copied, setCopied] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputVal.trim();
    if (!clean) return;

    if (!isAddress(clean)) {
      setValidationError("Please enter a valid 0x Electroneum address.");
      return;
    }

    setValidationError(null);
    onSearch(clean);
    setInputVal("");
  };

  const handleCopy = () => {
    if (!currentAddress) return;
    navigator.clipboard.writeText(currentAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncated = currentAddress
    ? `${currentAddress.slice(0, 8)}...${currentAddress.slice(-6)}`
    : "";

  return (
    <div className="space-y-3">
      {/* Search Input Row */}
      <form onSubmit={handleSearchSubmit} className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              if (validationError) setValidationError(null);
            }}
            placeholder="Search any 0x wallet or whale address on Electroneum (52014)..."
            className={cn(
              "w-full rounded-xl border bg-slate-950/80 pl-10 pr-4 py-2.5 text-xs font-mono text-slate-100 placeholder:text-slate-500 transition-all",
              validationError
                ? "border-rose-500/60 focus:border-rose-400 focus:ring-1 focus:ring-rose-500/20"
                : "border-slate-800 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 focus:outline-none"
            )}
          />
        </div>

        <button
          type="submit"
          className="shrink-0 rounded-xl bg-cyan-400 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-glow transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
        >
          Explore Address
        </button>
      </form>

      {validationError && (
        <p className="text-xs text-rose-400 pl-1">{validationError}</p>
      )}

      {/* Active Address Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/50 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          {/* Mode Pill Badge */}
          {isWhaleMode ? (
            <span className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-cyan-300">
              <Eye className="h-3 w-3 text-cyan-400" />
              Whale / Watch Mode
            </span>
          ) : (
            <InfoTooltip
              term={WEB3_GLOSSARY.eoa.term}
              definition={WEB3_GLOSSARY.eoa.definition}
            >
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-emerald-400 cursor-help">
                <UserCheck className="h-3 w-3 text-emerald-400" />
                Connected Wallet
              </span>
            </InfoTooltip>
          )}

          {isContract && (
            <InfoTooltip
              term={WEB3_GLOSSARY.contract.term}
              definition={WEB3_GLOSSARY.contract.definition}
              showIcon
            >
              <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[0.6rem] font-mono text-slate-300 hover:border-cyan-500/40 transition cursor-help">
                Smart Contract
              </span>
            </InfoTooltip>
          )}

          <span className="font-mono text-xs font-semibold text-slate-200">
            {truncated}
          </span>
        </div>

        {/* Action Buttons: Copy, Explorer, Bookmark */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy address"
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          <a
            href={`${ETN_EXPLORER_URL}/address/${currentAddress}`}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <span>Explorer</span>
            <ExternalLink className="h-3 w-3" />
          </a>

          <button
            type="button"
            onClick={onToggleWatchlist}
            title={isWatchlisted ? "Remove from Watchlist" : "Bookmark to Watchlist"}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition",
              isWatchlisted
                ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
            )}
          >
            {isWatchlisted ? (
              <>
                <BookmarkCheck className="h-3 w-3 text-amber-300" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Bookmark className="h-3 w-3" />
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
