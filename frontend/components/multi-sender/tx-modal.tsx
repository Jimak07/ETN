"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Download,
  Loader2,
  PenLine,
  Radio,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import type { SendProgress, AssetKind, NftStandard } from "@/hooks/use-multi-sender";
import { cn } from "@/lib/cn";
import { getEtnChainOrDefault } from "@/lib/etn";
import { explorerTxUrl } from "@/lib/multi-sender/contract";
import { formatTokenAmount, type RecipientRow } from "@/lib/multi-sender/parse";
import { exportDistributionReceiptCsv } from "@/lib/multi-sender/receipt";

type StepState = "done" | "active" | "pending" | "failed";

const SLOW_AFTER_MS = 20_000;

function shortHash(hash: string): string {
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

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
  chainId: number | null;
  onClose: () => void;
  recipients?: readonly RecipientRow[];
  asset?: AssetKind;
  nftStandard?: NftStandard;
}

export function TxModal({
  progress,
  symbol,
  totalWei,
  decimals,
  chainId,
  onClose,
  recipients = [],
  asset = "native",
  nftStandard = "erc721",
}: TxModalProps) {
  const reduceMotion = useReducedMotion();
  const chain = getEtnChainOrDefault(chainId);
  const open = progress.phase !== "idle";
  const busy = progress.phase === "signing" || progress.phase === "broadcasting";
  const broadcasting = progress.phase === "broadcasting";
  const confirmed = progress.phase === "confirmed";
  const unconfirmed = progress.phase === "unconfirmed";
  const failed = progress.phase === "error";
  const [slow, setSlow] = useState(false);
  const [receiptDownloaded, setReceiptDownloaded] = useState(false);

  useEffect(() => {
    if (!broadcasting) {
      setSlow(false);
      return;
    }

    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [broadcasting, progress.hash]);

  useEffect(() => {
    if (!confirmed || reduceMotion) return;

    let cancelled = false;
    void (async () => {
      const { default: confetti } = await import("canvas-confetti");
      if (cancelled) return;

      const colors = ["#22d3ee", "#34d399", "#e2e8f0"];
      confetti({
        particleCount: 80,
        spread: 68,
        startVelocity: 36,
        origin: { y: 0.32 },
        colors,
        disableForReducedMotion: true,
      });

      setTimeout(() => {
        if (!cancelled) {
          confetti({
            particleCount: 45,
            spread: 100,
            startVelocity: 26,
            origin: { y: 0.4 },
            colors,
            disableForReducedMotion: true,
          });
        }
      }, 180);
    })();

    return () => {
      cancelled = true;
    };
  }, [confirmed, reduceMotion]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose, open]);

  const handleDownloadReceipt = () => {
    if (!progress.hash) return;
    exportDistributionReceiptCsv({
      recipients,
      symbol,
      decimals,
      txHash: progress.hash,
      chainId,
      asset,
      nftStandard,
    });
    setReceiptDownloaded(true);
  };

  const signatureState: StepState =
    failed && progress.step === "batch" && !progress.hash
      ? "failed"
      : progress.phase === "signing" && progress.step === "batch"
        ? "active"
        : "done";
  const approvalState: StepState = progress.approvalHash
    ? failed && progress.step === "approval"
      ? "failed"
      : progress.step === "approval" && progress.phase !== "confirmed"
        ? "active"
        : "done"
    : "pending";
  const broadcastState: StepState =
    progress.phase === "broadcasting" ? "active" : confirmed || progress.hash ? "done" : "pending";
  const confirmState: StepState = confirmed
    ? "done"
    : failed && progress.hash
      ? "failed"
      : "pending";

  const inFlight = broadcasting || unconfirmed;

  const progressPct =
    progress.batchCount <= 1
      ? confirmed
        ? 100
        : inFlight
          ? 70
          : progress.phase === "signing"
            ? 25
            : 0
      : Math.round(
          ((confirmed ? progress.batchIndex : progress.batchIndex - 1) / progress.batchCount) * 100,
        ) + (confirmed || !inFlight ? 0 : 40 / progress.batchCount);

  const headline = confirmed
    ? "Batch confirmed"
    : unconfirmed
      ? "Broadcast — awaiting confirmation"
      : failed
        ? "Batch not sent"
        : broadcasting
          ? "Transaction broadcasted"
          : "Batch in progress";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="tx-modal"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/85 p-4 backdrop-blur-md sm:items-center"
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
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-800 bg-slate-900/95 p-5 shadow-2xl backdrop-blur-xl"
          >
            {/* Cyan hairline */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"
            />

            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  className={cn(
                    "text-[0.62rem] font-semibold uppercase tracking-[0.16em]",
                    confirmed
                      ? "text-emerald-400"
                      : unconfirmed
                        ? "text-amber-400"
                        : failed
                          ? "text-rose-400"
                          : "text-slate-400",
                  )}
                >
                  {headline}
                </p>
                <h2 className="mt-1 text-base font-semibold text-slate-100">
                  {formatTokenAmount(totalWei, decimals, 6)} {symbol}
                  <span className="font-mono text-slate-400"> to {progress.recipientCount} addresses</span>
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
                    Batch <span className="font-mono text-slate-300">{progress.batchIndex}</span> of{" "}
                    <span className="font-mono text-slate-300">{progress.batchCount}</span>
                  </span>
                  <span className="font-mono">{Math.min(100, Math.max(0, progressPct))}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800/80">
                  <motion.div
                    animate={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      "h-full rounded-full",
                      failed
                        ? "bg-rose-500"
                        : unconfirmed
                          ? "bg-amber-400"
                          : "bg-cyan-400",
                    )}
                  />
                </div>
              </div>
            ) : null}

            {/* POST-SEND CONFIRMED SUCCESS CARD */}
            {confirmed && progress.hash ? (
              <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                  <CircleCheck className="h-5 w-5 shrink-0" />
                  <span>Batch Confirmed Successfully!</span>
                </div>
                <div className="space-y-1.5 text-xs text-slate-300 border-t border-emerald-500/20 pt-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Transaction Hash:</span>
                    <a
                      href={explorerTxUrl(chainId, progress.hash)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-mono text-cyan-300 hover:underline inline-flex items-center gap-1"
                    >
                      {shortHash(progress.hash)}
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Verified Explorer:</span>
                    <span className="font-mono text-slate-200">Blockscout ({chain.name})</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Recipients Processed:</span>
                    <span className="font-mono text-slate-200">{progress.recipientCount} wallets</span>
                  </div>
                </div>

                {/* Download Distribution Receipt Button */}
                {recipients.length > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleDownloadReceipt}
                    className="w-full gap-2 border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {receiptDownloaded ? "Receipt Downloaded ✓" : "Download Distribution Receipt"}
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/* Broadcasting Notification */}
            {broadcasting && progress.hash && !confirmed ? (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3.5 py-3">
                <p className="flex items-center gap-2 text-xs font-medium text-emerald-400">
                  <CircleCheck className="h-4 w-4 shrink-0" />
                  Transaction Broadcasted
                </p>
                <a
                  href={explorerTxUrl(chainId, progress.hash)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono mt-1.5 inline-flex items-center gap-1 text-[0.68rem] text-cyan-300 transition hover:text-cyan-200"
                >
                  {shortHash(progress.hash)}
                  <ArrowUpRight className="h-3 w-3" />
                </a>
                <p className="mt-1.5 text-[0.68rem] leading-relaxed text-slate-400">
                  Transaction broadcasted to {chain.name}. Waiting for block confirmation...
                </p>
              </div>
            ) : null}

            {broadcasting && slow && progress.hash && !confirmed ? (
              <a
                href={explorerTxUrl(chainId, progress.hash)}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2.5 text-xs font-medium text-cyan-300 transition hover:border-cyan-400/60 hover:bg-cyan-500/20"
              >
                Taking longer than usual? Check Blockscout Explorer
                <ArrowUpRight className="h-3 w-3" />
              </a>
            ) : null}

            {unconfirmed ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/20 px-3.5 py-3">
                <p className="flex items-center gap-2 text-xs font-medium text-amber-400">
                  <Clock className="h-4 w-4 shrink-0" />
                  Still confirming on-chain
                </p>
                <p className="mt-1 text-[0.68rem] leading-relaxed text-slate-300">
                  Transaction submitted successfully. Block confirmation is taking longer than usual.
                  Check the explorer to verify block inclusion.
                </p>
                {progress.hash ? (
                  <a
                    href={explorerTxUrl(chainId, progress.hash)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 px-3.5 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-900/30"
                  >
                    Verify on Blockscout Explorer
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            ) : null}

            <ol className="mt-5 space-y-4">
              {progress.step === "approval" || progress.approvalHash ? (
                <Step
                  state={approvalState}
                  label="Approving token allowance / operator"
                  icon={<PenLine className="h-3.5 w-3.5" />}
                  detail={
                    progress.approvalHash ? (
                      <a
                        href={explorerTxUrl(chainId, progress.approvalHash)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-mono inline-flex items-center gap-1 transition hover:text-cyan-300"
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
                label="Awaiting wallet signature"
                icon={<PenLine className="h-3.5 w-3.5" />}
                detail={
                  progress.phase === "signing"
                    ? "Approve the batch in your wallet"
                    : "Signed by wallet"
                }
              />

              <Step
                state={broadcastState}
                label="Broadcasting to mempool"
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
                      className="font-mono inline-flex items-center gap-1 transition hover:text-cyan-300"
                    >
                      {progress.hash.slice(0, 12)}...{progress.hash.slice(-8)}
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  ) : (
                    "Waiting for network broadcast hash"
                  )
                }
              />

              <Step
                state={confirmState}
                label={`Confirmed on ${chain.name}`}
                icon={<CircleCheck className="h-3.5 w-3.5" />}
                detail={
                  confirmed
                    ? "Every transfer landed on-chain. Balances refreshed."
                    : unconfirmed
                      ? "Still waiting for receipt. Transaction is submitted."
                      : "Waiting for validator block inclusion"
                }
              />
            </ol>

            {failed && progress.error ? (
              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3.5 py-3">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-rose-300">{progress.error.title}</p>
                  <p className="text-[0.68rem] leading-relaxed text-slate-400">{progress.error.detail}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-800/80 pt-4">
              {(confirmed || unconfirmed) && progress.hash ? (
                <a
                  href={explorerTxUrl(chainId, progress.hash)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3.5 py-2 text-xs font-medium text-slate-300 transition hover:border-cyan-500/40 hover:text-cyan-300"
                >
                  View on explorer <ArrowUpRight className="h-3 w-3" />
                </a>
              ) : null}

              <Button
                type="button"
                variant={confirmed ? "glow" : "outline"}
                onClick={onClose}
                disabled={busy}
                className={cn(
                  "gap-1.5",
                  confirmed && "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                )}
              >
                {confirmed
                  ? "Send another batch"
                  : failed || unconfirmed
                    ? "Back to the list"
                    : "Sending..."}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
