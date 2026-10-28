"use client";

import { Bookmark, CheckSquare, Layers, Sparkles, Square, X } from "lucide-react";
import type { Address } from "viem";

import { IS_PREMIUM_USER } from "@/lib/constants/myverse";
import type { WatchlistItem } from "@/lib/portfolio/types";
import { cn } from "@/lib/cn";

interface WatchlistBarProps {
  watchlist: WatchlistItem[];
  activeAddress: string;
  onSelect: (address: string) => void;
  onRemove: (address: string) => void;
  isBundleMode?: boolean;
  selectedBundleAddresses?: Address[];
  onToggleBundleMode?: () => void;
  onToggleSelectBundle?: (address: string) => void;
  onSelectAllBundle?: () => void;
  onClearBundle?: () => void;
}

export function WatchlistBar({
  watchlist,
  activeAddress,
  onSelect,
  onRemove,
  isBundleMode = false,
  selectedBundleAddresses = [],
  onToggleBundleMode,
  onToggleSelectBundle,
  onSelectAllBundle,
  onClearBundle,
}: WatchlistBarProps) {
  if (watchlist.length === 0) return null;

  const isSelectedInBundle = (address: string) => {
    return selectedBundleAddresses.some(
      (a) => a.toLowerCase() === address.toLowerCase()
    );
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 overflow-x-auto pb-1 no-scrollbar border-b border-slate-800/60 pt-1">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500 shrink-0">
          <Bookmark className="h-3 w-3 text-cyan-400" />
          <span>Watchlist:</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {watchlist.map((item) => {
            const isSingleActive =
              !isBundleMode && item.address.toLowerCase() === activeAddress.toLowerCase();
            const isBundleSelected = isBundleMode && isSelectedInBundle(item.address);

            return (
              <div
                key={item.address}
                className={cn(
                  "group flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition duration-200",
                  isBundleSelected
                    ? "border-amber-500/50 bg-amber-500/15 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.2)]"
                    : isSingleActive
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.2)]"
                      : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                )}
              >
                {isBundleMode ? (
                  <button
                    type="button"
                    onClick={() => onToggleSelectBundle?.(item.address)}
                    className="flex items-center gap-1.5 text-left font-medium focus:outline-none"
                  >
                    {isBundleSelected ? (
                      <CheckSquare className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    )}
                    <span>{item.label}</span>
                    <span className="font-mono text-[0.62rem] text-slate-500">
                      {item.address.slice(0, 4)}...{item.address.slice(-3)}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(item.address)}
                    className="flex items-center gap-1.5 text-left font-medium focus:outline-none"
                  >
                    <span>{item.label}</span>
                    <span className="font-mono text-[0.62rem] text-slate-500">
                      {item.address.slice(0, 4)}...{item.address.slice(-3)}
                    </span>
                  </button>
                )}

                {!isBundleMode && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item.address);
                    }}
                    title="Remove from watchlist"
                    className="opacity-40 group-hover:opacity-100 transition hover:text-rose-400 p-0.5 rounded"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bundle Mode Controls */}
      {onToggleBundleMode && (
        <div className="flex items-center gap-2 shrink-0">
          {isBundleMode && (
            <div className="flex items-center gap-1.5 text-[0.68rem] text-slate-400">
              <span className="font-mono text-amber-400 font-semibold">
                {selectedBundleAddresses.length}/10
              </span>
              <span>Selected</span>
              <button
                type="button"
                onClick={onSelectAllBundle}
                className="ml-1 text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                All
              </button>
              <span>·</span>
              <button
                type="button"
                onClick={onClearBundle}
                className="text-slate-400 hover:text-slate-200 underline underline-offset-2"
              >
                Clear
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleBundleMode}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition duration-200 shadow-sm",
              isBundleMode
                ? "border-amber-500/50 bg-amber-500/20 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.25)]"
                : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
            )}
          >
            <Layers className="h-3 w-3 text-amber-400" />
            <span>Combine Wallets</span>
            {IS_PREMIUM_USER && (
              <span className="rounded bg-amber-400/20 border border-amber-400/40 px-1 py-0.2 text-[0.56rem] font-bold uppercase tracking-wider text-amber-300">
                PRO
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
