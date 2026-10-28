"use client";

import { Bookmark, Sparkles, X } from "lucide-react";
import type { WatchlistItem } from "@/lib/portfolio/types";
import { cn } from "@/lib/cn";

interface WatchlistBarProps {
  watchlist: WatchlistItem[];
  activeAddress: string;
  onSelect: (address: string) => void;
  onRemove: (address: string) => void;
}

export function WatchlistBar({
  watchlist,
  activeAddress,
  onSelect,
  onRemove,
}: WatchlistBarProps) {
  if (watchlist.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
      <div className="flex items-center gap-1.5 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500 shrink-0">
        <Bookmark className="h-3 w-3 text-cyan-400" />
        <span>Watchlist:</span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {watchlist.map((item) => {
          const isActive = item.address.toLowerCase() === activeAddress.toLowerCase();

          return (
            <div
              key={item.address}
              className={cn(
                "group flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition duration-200",
                isActive
                  ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.2)]"
                  : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              )}
            >
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
