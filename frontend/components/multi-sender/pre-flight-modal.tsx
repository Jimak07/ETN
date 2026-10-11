"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Fuel,
  Lock,
  Rocket,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import type { AssetKind, NftStandard } from "@/hooks/use-multi-sender";
import { cn } from "@/lib/cn";
import { explorerAddressUrl } from "@/lib/multi-sender/contract";
import { formatTokenAmount } from "@/lib/multi-sender/parse";

interface PreFlightModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  recipientCount: number;
  totalWei: bigint;
  symbol: string;
  decimals: number;
  contractAddress: string | null;
  chainId: number | null;
  chainName: string;
  asset: AssetKind;
  nftStandard?: NftStandard;
  approvalNeeded: boolean;
  estimatedGasEth: string;
}

export function PreFlightModal({
  open,
  onClose,
  onConfirm,
  recipientCount,
  totalWei,
  symbol,
  decimals,
  contractAddress,
  chainId,
  chainName,
  asset,
  nftStandard,
  approvalNeeded,
  estimatedGasEth,
}: PreFlightModalProps) {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const isErc721 = asset === "nft" && nftStandard === "erc721";

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="preflight-modal"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm Batch Disbursement"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/85 p-4 backdrop-blur-md sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-xl"
          >
            {/* Glowing hairline accent */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent"
            />

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-950/40 text-cyan-300">
                  <Rocket className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-slate-100">
                    Pre-Flight Batch Confirmation
                  </h2>
                  <p className="text-xs text-slate-400">
                    Review summary parameters before prompting your Web3 wallet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg border border-slate-800 p-1.5 text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Parameter Summary Cards */}
            <div className="mt-5 space-y-2.5">
              {/* Row 1: Recipients & Asset */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex items-center gap-1.5 text-[0.68rem] text-slate-400">
                    <Users className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Total Recipients</span>
                  </div>
                  <p className="font-mono mt-1 text-xl font-bold text-slate-100">
                    {recipientCount} <span className="text-xs font-normal text-slate-500">wallets</span>
                  </p>
                </div>

                <div className="rounded-xl border border-cyan-500/20 bg-slate-950/60 p-3">
                  <div className="flex items-center gap-1.5 text-[0.68rem] text-cyan-400">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Total Disbursement</span>
                  </div>
                  <p className="font-mono mt-1 truncate text-xl font-bold text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">
                    {isErc721
                      ? `${recipientCount} ${symbol}`
                      : `${formatTokenAmount(totalWei, decimals, 4)} ${symbol}`}
                  </p>
                </div>
              </div>

              {/* Row 2: Target Contract & Network */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Target Network:</span>
                  <span className="font-mono font-medium text-slate-200">
                    {chainName} ({chainId ?? "—"})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Smart Contract:</span>
                  {contractAddress ? (
                    <a
                      href={explorerAddressUrl(chainId, contractAddress)}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-mono inline-flex items-center gap-1 text-cyan-400 hover:underline"
                    >
                      {contractAddress.slice(0, 10)}...{contractAddress.slice(-6)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    <span className="font-mono text-slate-500">Unset</span>
                  )}
                </div>
                <div className="flex items-center justify-between border-t border-slate-800/80 pt-2">
                  <span className="flex items-center gap-1 text-slate-400">
                    <Fuel className="h-3.5 w-3.5 text-cyan-400" /> Est. Network Fee:
                  </span>
                  <span className="font-mono font-semibold text-slate-300">
                    ~{estimatedGasEth}
                  </span>
                </div>
              </div>

              {/* Row 3: Allowance / Pre-requisite Check */}
              <div
                className={cn(
                  "rounded-xl border p-3 text-xs",
                  approvalNeeded
                    ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
                    : "border-emerald-500/30 bg-emerald-950/20 text-emerald-300"
                )}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="flex items-center gap-1.5">
                    {approvalNeeded ? (
                      <Lock className="h-4 w-4 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    )}
                    {approvalNeeded ? "Prerequisite Approval Required" : "Token Allowance Verified"}
                  </span>
                </div>
                <p className="mt-1 text-[0.68rem] leading-relaxed opacity-90">
                  {approvalNeeded
                    ? asset === "nft"
                      ? "Your wallet will first be prompted for an NFT Operator approval (setApprovalForAll), followed immediately by the batch transaction."
                      : `Your wallet will first be prompted to approve exactly ${formatTokenAmount(totalWei, decimals, 4)} ${symbol}, followed immediately by the batch dispatch.`
                    : "Sufficient allowance is already authorized. Your transaction will directly broadcast the multi-send batch."}
                </p>
              </div>
            </div>

            {/* Disclaimer */}
            <div className="mt-4 flex items-start gap-2 text-[0.68rem] text-slate-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>
                Transfers execute directly via smart contract. Ensure all addresses and amounts are correct before proceeding.
              </span>
            </div>

            {/* Actions */}
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-800/80 pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>
                Back to Review
              </Button>
              <Button
                type="button"
                variant="glow"
                onClick={() => {
                  onClose();
                  onConfirm();
                }}
                className="gap-2 px-5 text-sm font-semibold"
              >
                <span>Confirm & Broadcast</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
