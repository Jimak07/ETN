"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import { useEffect } from "react";
import type { Hash } from "viem";

import { Button } from "@/components/ui/button";
import type { TokenInfo } from "@/lib/constants/electroswap";
import { ETN_MAINNET } from "@/lib/etn";
import type { SwapPhase } from "@/hooks/use-swap";

interface SwapTxModalProps {
  phase: SwapPhase;
  txHash: Hash | null;
  error: string | null;
  onClose: () => void;
  payToken: TokenInfo;
  receiveToken: TokenInfo;
  payAmount: string;
  receiveAmount: string;
}

export function SwapTxModal({
  phase,
  txHash,
  error,
  onClose,
  payToken,
  receiveToken,
  payAmount,
  receiveAmount,
}: SwapTxModalProps) {
  const reduceMotion = useReducedMotion();
  const open = phase !== "idle";

  useEffect(() => {
    if (phase !== "confirmed" || reduceMotion) return;
    let cancelled = false;
    void (async () => {
      try {
        const { default: confetti } = await import("canvas-confetti");
        if (cancelled) return;
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#22d3ee", "#06b6d4", "#38bdf8", "#34d399"],
        });
      } catch {
        // Confetti is decorative only
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, reduceMotion]);

  const explorerUrl = txHash ? `${ETN_MAINNET.explorerUrl}/tx/${txHash}` : null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="swap-tx-modal-backdrop"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md"
        >
          <motion.div
            key="swap-tx-modal-content"
            initial={reduceMotion ? false : { scale: 0.95, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { scale: 0.95, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl shadow-cyan-950/30 backdrop-blur-2xl text-center"
          >
            {/* Top ambient highlight line */}
            <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent pointer-events-none" />

            <button
              type="button"
              onClick={onClose}
              disabled={phase === "signing" || phase === "broadcasting"}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Status Icon */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border mb-4">
              {phase === "signing" ? (
                <div className="h-full w-full flex items-center justify-center rounded-2xl border-cyan-500/40 bg-cyan-950/30 text-cyan-300">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
              ) : phase === "broadcasting" ? (
                <div className="h-full w-full flex items-center justify-center rounded-2xl border-cyan-500/40 bg-cyan-950/30 text-cyan-300">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </div>
              ) : phase === "confirmed" ? (
                <div className="h-full w-full flex items-center justify-center rounded-2xl border-emerald-500/40 bg-emerald-950/30 text-emerald-400">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
              ) : (
                <div className="h-full w-full flex items-center justify-center rounded-2xl border-rose-500/40 bg-rose-950/30 text-rose-400">
                  <XCircle className="h-7 w-7" />
                </div>
              )}
            </div>

            {/* Title & Description */}
            <h3 className="text-lg font-bold text-slate-100">
              {phase === "signing"
                ? "Waiting for Wallet"
                : phase === "broadcasting"
                ? "Broadcasting Transaction"
                : phase === "confirmed"
                ? "Swap Successful!"
                : "Transaction Failed"}
            </h3>

            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              {phase === "signing"
                ? "Confirm the swap transaction in your connected wallet."
                : phase === "broadcasting"
                ? "Mining on Electroneum Smart Chain. Please wait for confirmation."
                : phase === "confirmed"
                ? `Swapped ${payAmount} ${payToken.symbol} for ${receiveAmount} ${receiveToken.symbol}.`
                : error || "The swap could not be completed. Check gas or slippage."}
            </p>

            {/* Explorer link */}
            {explorerUrl ? (
              <a
                href={explorerUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-cyan-300 hover:text-cyan-200 transition"
              >
                View on Blockscout Explorer <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            ) : null}

            {/* Action button */}
            <div className="mt-6">
              {phase === "confirmed" || phase === "error" ? (
                <Button
                  type="button"
                  onClick={onClose}
                  className="w-full bg-slate-800 text-slate-100 hover:bg-slate-700 h-9 rounded-xl text-xs font-semibold"
                >
                  Close
                </Button>
              ) : (
                <div className="py-1 text-[0.7rem] text-slate-500 font-mono">
                  Confirming on Electroneum Mainnet...
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
