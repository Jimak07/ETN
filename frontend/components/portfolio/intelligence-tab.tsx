"use client";

import { useState } from "react";
import {
  Activity,
  Calendar,
  Crown,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Fuel,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { Address } from "viem";

import { IS_PREMIUM_USER } from "@/lib/constants/myverse";
import { ETN_EXPLORER_URL } from "@/lib/etn";
import type { TokenApprovalItem, WalletIntelligence } from "@/lib/portfolio/types";
import { cn } from "@/lib/cn";

interface IntelligenceTabProps {
  intelligence: WalletIntelligence;
  loading: boolean;
  canRevoke?: boolean;
  revokingSpender?: string | null;
  batchRevoking?: boolean;
  revokeProgress?: { current: number; total: number } | null;
  onRevoke?: (tokenAddress: Address, spenderAddress: Address) => Promise<boolean>;
  onBatchRevoke?: (approvals: TokenApprovalItem[]) => Promise<{ successful: number; failed: number }>;
  onExportTaxLedger?: () => void;
}

export function IntelligenceTab({
  intelligence,
  loading,
  canRevoke = false,
  revokingSpender = null,
  batchRevoking = false,
  revokeProgress = null,
  onRevoke,
  onBatchRevoke,
  onExportTaxLedger,
}: IntelligenceTabProps) {
  const [revokeFeedback, setRevokeFeedback] = useState<string | null>(null);

  if (loading && intelligence.totalTransactions === 0) {
    return (
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4 py-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 w-full animate-pulse rounded-xl bg-slate-900/60" />
        ))}
      </div>
    );
  }

  const {
    totalTransactions,
    cumulativeGasSpentEtn,
    cumulativeGasSpentUsd,
    walletAgeDays,
    firstTxDate,
    approvals,
  } = intelligence;

  const handleSingleRevoke = async (tokenAddress: Address, spenderAddress: Address) => {
    if (!onRevoke) return;
    setRevokeFeedback(null);
    try {
      await onRevoke(tokenAddress, spenderAddress);
      setRevokeFeedback("Allowance revoked successfully.");
      setTimeout(() => setRevokeFeedback(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Revoke failed";
      setRevokeFeedback(`Error: ${msg}`);
      setTimeout(() => setRevokeFeedback(null), 5000);
    }
  };

  const handleBatchRevoke = async () => {
    if (!onBatchRevoke || approvals.length === 0) return;
    setRevokeFeedback(null);
    try {
      const res = await onBatchRevoke(approvals);
      setRevokeFeedback(`Batch completed: ${res.successful} revoked, ${res.failed} failed.`);
      setTimeout(() => setRevokeFeedback(null), 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Batch revoke failed";
      setRevokeFeedback(`Error: ${msg}`);
      setTimeout(() => setRevokeFeedback(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {/* 4 Summary Intelligence KPI Cards */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Total Transactions */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider">
              Total Transactions
            </span>
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="font-mono mt-2 text-2xl font-bold text-white">
            {totalTransactions.toLocaleString()}
          </p>
          <p className="mt-1 text-[0.68rem] text-slate-500">
            Recorded on Electroneum Mainnet
          </p>
        </div>

        {/* KPI 2: Cumulative Gas Spent */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider">
              Cumulative Gas Spent
            </span>
            <Fuel className="h-4 w-4 text-amber-400" />
          </div>
          <p className="font-mono mt-2 text-2xl font-bold text-white">
            {cumulativeGasSpentEtn.toLocaleString()}{" "}
            <span className="text-sm font-semibold text-cyan-400">ETN</span>
          </p>
          <p className="mt-1 font-mono text-[0.68rem] text-slate-500">
            ≈ ${cumulativeGasSpentUsd.toFixed(2)} USD
          </p>
        </div>

        {/* KPI 3: Wallet Age */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider">
              Wallet Age
            </span>
            <Calendar className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="font-mono mt-2 text-2xl font-bold text-white">
            {walletAgeDays} <span className="text-sm font-semibold text-slate-400">days</span>
          </p>
          <p className="mt-1 text-[0.68rem] text-slate-500">
            First activity: {firstTxDate ?? "Recent"}
          </p>
        </div>

        {/* KPI 4: Active Approvals / Revoke Shield */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wider">
              Revoke Shield
            </span>
            {approvals.length > 0 ? (
              <ShieldAlert className="h-4 w-4 text-amber-400" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
            )}
          </div>
          <p className="font-mono mt-2 text-2xl font-bold text-white">
            {approvals.length}{" "}
            <span className="text-sm font-semibold text-slate-400">active</span>
          </p>
          <p className="mt-1 text-[0.68rem] text-slate-500">
            {approvals.length === 0 ? "Zero open spending allowances" : "Spender contracts authorized"}
          </p>
        </div>
      </div>

      {/* Revoke Feedback Banner */}
      {revokeFeedback && (
        <div
          className={cn(
            "rounded-xl border p-3 text-xs font-medium transition",
            revokeFeedback.startsWith("Error")
              ? "border-rose-500/30 bg-rose-950/40 text-rose-300"
              : "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
          )}
        >
          {revokeFeedback}
        </div>
      )}

      {/* Active Approvals Section (Revoke Shield with 1-Click & Batch Revoke) */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Revoke Shield · Active Allowances
            </h3>
            {IS_PREMIUM_USER && (
              <span className="rounded bg-cyan-400/20 border border-cyan-400/40 px-1 py-0.2 text-[0.55rem] font-bold uppercase tracking-wider text-cyan-300">
                PRO
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Batch Revoke Button */}
            {canRevoke && approvals.length > 0 && onBatchRevoke && (
              <button
                type="button"
                disabled={batchRevoking}
                onClick={handleBatchRevoke}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 transition duration-200 hover:bg-amber-500/25 disabled:opacity-50 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
              >
                {batchRevoking ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>
                      Revoking ({revokeProgress?.current ?? 0}/{revokeProgress?.total ?? approvals.length})...
                    </span>
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    <span>Batch Revoke All ({approvals.length})</span>
                  </>
                )}
              </button>
            )}

            {/* Export Tax Ledger button */}
            {onExportTaxLedger && (
              <button
                type="button"
                onClick={onExportTaxLedger}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-700 hover:text-white transition"
              >
                <Download className="h-3 w-3 text-cyan-400" />
                <span>Export Ledger CSV</span>
              </button>
            )}
          </div>
        </div>

        {approvals.length === 0 ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-4 text-xs text-emerald-300">
            <strong>Optimal Security:</strong> This wallet has zero open allowances to external smart contracts. Your assets cannot be withdrawn by foreign spenders.
          </div>
        ) : (
          <div className="space-y-2">
            {approvals.map((app) => {
              const rowKey = `${app.tokenAddress.toLowerCase()}-${app.spenderAddress.toLowerCase()}`;
              const isRowRevoking = revokingSpender === rowKey;

              return (
                <div
                  key={rowKey}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 text-xs transition duration-200 hover:border-slate-700"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{app.tokenSymbol}</span>
                      <span className="text-slate-500">→</span>
                      <span className="font-semibold text-cyan-300">{app.spenderName}</span>
                    </div>
                    <p className="font-mono text-[0.68rem] text-slate-500 mt-0.5">
                      Spender: {app.spenderAddress.slice(0, 8)}...{app.spenderAddress.slice(-6)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-mono font-semibold text-slate-200">
                        {app.allowanceFormatted}
                      </span>
                      <span
                        className={
                          app.isUnlimited
                            ? "block text-[0.62rem] text-amber-400 font-medium"
                            : "block text-[0.62rem] text-emerald-400"
                        }
                      >
                        {app.isUnlimited ? "Unlimited Allowance" : "Bounded Allowance"}
                      </span>
                    </div>

                    <a
                      href={`${ETN_EXPLORER_URL}/address/${app.spenderAddress}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="p-1.5 rounded-lg border border-slate-800 text-slate-400 hover:text-cyan-300 transition"
                      title="Inspect Spender Contract"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>

                    {/* 1-Click Revoke (Set to 0) */}
                    {canRevoke ? (
                      <button
                        type="button"
                        disabled={isRowRevoking || batchRevoking}
                        onClick={() => handleSingleRevoke(app.tokenAddress, app.spenderAddress)}
                        className="flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-1.5 font-semibold text-rose-300 transition duration-200 hover:border-rose-400/50 hover:bg-rose-950/50 disabled:opacity-50"
                      >
                        {isRowRevoking ? (
                          <Loader2 className="h-3 w-3 animate-spin text-rose-400" />
                        ) : (
                          <ShieldOff className="h-3 w-3 text-rose-400" />
                        )}
                        <span>Revoke</span>
                      </button>
                    ) : (
                      <span
                        title="Connect this wallet in your Web3 extension to revoke allowances"
                        className="rounded border border-slate-800 bg-slate-900/40 px-2 py-1 text-[0.62rem] text-slate-500 font-mono"
                      >
                        Read-Only
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
