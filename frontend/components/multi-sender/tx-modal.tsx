"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Loader2,
  PenLine,
  Radio,
  X,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { getEtnChainOrDefault } from "@/lib/etn";
import { explorerTxUrl } from "@/lib/multi-sender/contract";
import { formatTokenAmount } from "@/lib/multi-sender/parse";
import type { SendProgress } from "@/hooks/use-multi-sender";

/**
 * Transaction status modal.
 *
 * The three states the user actually experiences are named explicitly - awaiting
 * signature, broadcasting, confirmed - because the gap between pressing Send and
 * a receipt is where trust is won or lost. It cannot be dismissed while a
 * signature or receipt is outstanding: closing it would hide the only place the
 * run's progress is reported.
 */

type StepState = "done" | "active" | "pending" | "failed";

interface StepProps {
  state: StepState;
  label: string;
  detail?: ReactNode;
  icon: ReactNode;
}

function Step({ state, label, detail, icon }: StepProps) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition",
          state === "done" && "border-status-healthy/40 bg-status-healthy/10 text-status-healthy",
          state === "active" && "border-cyan-400/50 bg-cyan-500/15 text-cyan-300",
          state === "pending" && "border-slate-800 bg-slate-900/60 text-slate-600",
          state === "failed" && "border-status-offline/40 bg-status-offline/10 text-status-offline",
        )}
      >
        {state === "done" ? <CircleCheck className="h-3.5 w-3.5" /> : icon}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "text-xs font-medium",
            state === "pending" ? "text-slate-500" : "text-slate-200",
          )}
        >
          {label}
        </p>
        {detail ? <div className="mt-0.5 text-[0.68rem] leading-relaxed text-slate-500">{detail}</div> : null}
      </div>
    </li>
  );
}

interface TxModalProps {
  progress: SendProgress;
  symbol: string;
  totalWei: bigint;
  decimals: number;
  /** Chain the batch was signed on; decides which explorer the links point at. */
  chainId: number | null;
  onClose: () => void;
}

export function TxModal({ progress, symbol, totalWei, decimals, chainId, onClose }: TxModalProps) {
  const reduceMotion = useReducedMotion();
  const chain = getEtnChainOrDefault(chainId);
  const open = progress.phase !== "idle";
  const busy = progress.phase === "signing" || progress.phase === "broadcasting";
  const confirmed = progress.phase === "confirmed";
  const failed = progress.phase === "error";

  // A short two-burst confetti rather than a continuous rain: it reads as
  // punctuation on the success state instead of a screensaver.
  useEffect(() => {
    if (!confirmed || reduceMotion) return;

    let cancelled = false;
    void (async () => {
      const { default: confetti } = await import("canvas-confetti");
      if (cancelled) return;

      const colors = ["#22d3ee", "#34d399", "#e2e8f0"];
      confetti({ particleCount: 80, spread: 68, startVelocity: 36, origin: { y: 0.32 }, colors, disableForReducedMotion: true });

      setTimeout(() => {
        if (!cancelled) {
          confetti({ particleCount: 45, spread: 100, startVelocity: 26, origin: { y: 0.4 }, colors, disableForReducedMotion: true });
        }
      }, 180);
    })();

    return () => {
      cancelled = true;
    };
  }, [confirmed, reduceMotion]);

  // Escape closes only once the run has settled, so a stray keypress cannot hide
  // a pending signature or a broadcast in flight.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  const signatureState: StepState = failed && progress.step === "batch" && !progress.hash ? "failed" : progress.phase === "signing" && progress.step === "batch" ? "active" : "done";
  const approvalState: StepState = progress.approvalHash
    ? failed && progress.step === "approval"
      ? "failed"
      : progress.step === "approval" && progress.phase !== "confirmed"
        ? "active"
        : "done"
    : "pending";
  const broadcastState: StepState =
    progress.phase === "broadcasting" ? "active" : confirmed || progress.hash ? "done" : "pending";
  const confirmState: StepState = confirmed ? "done" : failed && progress.hash ? "failed" : "pending";

  const progressPct =
    progress.batchCount <= 1
      ? confirmed
        ? 100
        : progress.phase === "broadcasting"
          ? 70
          : progress.phase === "signing"
            ? 25
            : 0
      : Math.round(((progress.phase === "confirmed" ? progress.batchIndex : progress.batchIndex - 1) / progress.batchCount) * 100) +
        (confirmed ? 0 : progress.phase === "broadcasting" ? 40 / progress.batchCount : 0);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="tx-modal"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Batch transaction status"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) onClose();
          }}
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="glass-panel shadow-card w-full max-w-md p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-slate-500">
                  {confirmed ? "Batch confirmed" : failed ? "Batch not sent" : "Batch in progress"}
                </p>
                <h2 className="mt-1 text-base font-semibold text-slate-100">
                  {formatTokenAmount(totalWei, decimals, 6)} {symbol}
                  <span className="num text-slate-500"> to {progress.recipientCount} addresses</span>
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                aria-label="Close"
                className="rounded-lg border border-slate-800 p-1.5 text-slate-500 transition hover:border-slate-700 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {progress.batchCount > 1 ? (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[0.68rem] text-slate-500">
                  <span>
                    Batch <span className="num text-slate-300">{progress.batchIndex}</span> of{" "}
                    <span className="num text-slate-300">{progress.batchCount}</span>
                  </span>
                  <span className="num">{Math.min(100, Math.max(0, progressPct))}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800/80">
                  <motion.div
                    animate={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className={cn("h-full rounded-full", failed ? "bg-status-offline" : "bg-cyan-400")}
                  />
                </div>
              </div>
            ) : null}

            <ol className="mt-5 space-y-4">
              {progress.step === "approval" || progress.approvalHash ? (
                <Step
                  state={approvalState}
                  label="Approving the token"
                  icon={<PenLine className="h-3.5 w-3.5" />}
                  detail={
                    progress.approvalHash ? (
                      <a
                        href={explorerTxUrl(chainId, progress.approvalHash)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="num inline-flex items-center gap-1 transition hover:text-cyan-300"
                      >
                        {progress.approvalHash.slice(0, 12)}...{progress.approvalHash.slice(-8)}
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : (
                      "Confirm the allowance in your wallet"
                    )
                  }
                />
              ) : null}

              <Step
                state={signatureState}
                label="Awaiting signature"
                icon={<PenLine className="h-3.5 w-3.5" />}
                detail={
                  progress.phase === "signing"
                    ? "Approve the batch in your wallet"
                    : "Signed by your wallet"
                }
              />

              <Step
                state={broadcastState}
                label="Broadcasting"
                icon={
                  progress.phase === "broadcasting" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Radio className="h-3.5 w-3.5" />
                  )
                }
                detail={
                  progress.hash ? (
                    <a
                      href={explorerTxUrl(chainId, progress.hash)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="num inline-flex items-center gap-1 transition hover:text-cyan-300"
                    >
                      {progress.hash.slice(0, 12)}...{progress.hash.slice(-8)}
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  ) : (
                    "Waiting for a transaction hash"
                  )
                }
              />

              <Step
                state={confirmState}
                label={`Confirmed on ${chain.name}`}
                icon={<CircleCheck className="h-3.5 w-3.5" />}
                detail={confirmed ? "Every transfer landed. Balances are refreshing." : "Waiting for the receipt"}
              />
            </ol>

            {failed && progress.error ? (
              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-status-offline/30 bg-status-offline/[0.07] px-3.5 py-3">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-status-offline" />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-status-offline">{progress.error.title}</p>
                  <p className="text-[0.68rem] leading-relaxed text-slate-400">{progress.error.detail}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              {confirmed && progress.hash ? (
                <a
                  href={explorerTxUrl(chainId, progress.hash)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3.5 py-2.5 text-xs font-medium text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300"
                >
                  View on explorer <ArrowUpRight className="h-3 w-3" />
                </a>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  confirmed
                    ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                    : "border border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700",
                )}
              >
                {confirmed ? "Send another batch" : failed ? "Back to the list" : "Sending..."}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
