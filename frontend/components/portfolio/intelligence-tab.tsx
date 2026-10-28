"use client";

import { Activity, Calendar, ExternalLink, Fuel, Lock, ShieldAlert, ShieldCheck, Zap } from "lucide-react";
import Link from "next/link";

import { ETN_EXPLORER_URL } from "@/lib/etn";
import type { TokenApprovalItem, WalletIntelligence } from "@/lib/portfolio/types";

interface IntelligenceTabProps {
  intelligence: WalletIntelligence;
  loading: boolean;
}

export function IntelligenceTab({ intelligence, loading }: IntelligenceTabProps) {
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

      {/* Active Approvals Section (Revoke Shield) */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100">
              Revoke Shield · Active Allowances
            </h3>
          </div>
          <span className="rounded-full border border-slate-700 bg-slate-950/60 px-2 py-0.5 text-[0.62rem] text-slate-400 font-mono">
            On-Chain Allowance Audit
          </span>
        </div>

        {approvals.length === 0 ? (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/15 p-4 text-xs text-emerald-300">
            <strong>Optimal Security:</strong> This wallet has zero open allowances to external smart contracts. Your assets cannot be withdrawn by foreign spenders.
          </div>
        ) : (
          <div className="space-y-2">
            {approvals.map((app) => (
              <div
                key={`${app.tokenAddress}-${app.spenderAddress}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3.5 text-xs"
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
