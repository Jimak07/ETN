"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Clock, Settings2, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { SLIPPAGE_PRESETS } from "@/lib/constants/electroswap";

interface SlippagePopoverProps {
  open: boolean;
  onClose: () => void;
  slippage: number;
  onSlippageChange: (val: number) => void;
  deadlineMinutes: number;
  onDeadlineChange: (val: number) => void;
}

export function SlippagePopover({
  open,
  onClose,
  slippage,
  onSlippageChange,
  deadlineMinutes,
  onDeadlineChange,
}: SlippagePopoverProps) {
  const reduceMotion = useReducedMotion();
  const [customSlippage, setCustomSlippage] = useState<string>("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  const handleCustomChange = (val: string) => {
    setCustomSlippage(val);
    const parsed = Number.parseFloat(val);
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 50) {
      onSlippageChange(parsed);
    }
  };

  const isPreset = SLIPPAGE_PRESETS.includes(slippage as 0.1 | 0.5 | 1.0);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={popoverRef}
          initial={reduceMotion ? false : { opacity: 0, scale: 0.95, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, scale: 0.95, y: -6 }}
          transition={{ duration: 0.15 }}
          className="absolute right-0 top-12 z-40 w-80 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
              <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
              <span>Swap Settings</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-4 pt-3">
            {/* Slippage tolerance */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Slippage Tolerance</span>
                <span className="font-mono text-cyan-300 font-semibold">{slippage}%</span>
              </div>

              <div className="flex items-center gap-1.5">
                {SLIPPAGE_PRESETS.map((preset) => {
                  const active = slippage === preset && !customSlippage;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setCustomSlippage("");
                        onSlippageChange(preset);
                      }}
                      className={cn(
                        "flex-1 rounded-lg border py-1.5 text-xs font-medium transition",
                        active
                          ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-200"
                          : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                      )}
                    >
                      {preset}%
                    </button>
                  );
                })}

                <div className="relative flex-[1.2]">
                  <Input
                    type="number"
                    step="0.1"
                    min="0.01"
                    max="50"
                    placeholder="Custom"
                    value={customSlippage}
                    onChange={(e) => handleCustomChange(e.target.value)}
                    className={cn(
                      "h-8 pr-6 text-xs font-mono text-right border-slate-800 bg-slate-950/80",
                      !isPreset && customSlippage
                        ? "border-cyan-500/50 text-cyan-200 ring-1 ring-cyan-500/20"
                        : "text-slate-200"
                    )}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 pointer-events-none">
                    %
                  </span>
                </div>
              </div>

              {/* Warnings */}
              {slippage < 0.05 ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-950/20 p-2 text-[0.68rem] text-amber-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>Low slippage may cause your swap to revert.</span>
                </div>
              ) : slippage > 5 ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-950/20 p-2 text-[0.68rem] text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                  <span>High slippage increases front-running risk.</span>
                </div>
              ) : null}
            </div>

            {/* Transaction Deadline */}
            <div className="space-y-2 pt-1 border-t border-slate-800/60">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1">
                  <Clock className="h-3 w-3 text-slate-400" /> Tx Deadline
                </span>
                <span className="font-mono text-slate-400">{deadlineMinutes} mins</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="180"
                  value={deadlineMinutes}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    if (!Number.isNaN(parsed) && parsed > 0) {
                      onDeadlineChange(parsed);
                    }
                  }}
                  className="h-8 border-slate-800 bg-slate-950/80 text-xs font-mono"
                />
                <span className="text-xs text-slate-400 shrink-0">minutes</span>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
