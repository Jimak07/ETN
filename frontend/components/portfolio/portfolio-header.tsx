"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  Crown,
  Download,
  FileSpreadsheet,
  Flame,
  Layers,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { IS_PREMIUM_USER } from "@/lib/constants/myverse";
import { exportPortfolioSnapshotCsv, exportTaxLedgerCsv } from "@/lib/portfolio/export-csv";
import type { PortfolioSummary, Timeframe } from "@/lib/portfolio/types";
import { cn } from "@/lib/cn";

interface PortfolioHeaderProps {
  summary: PortfolioSummary | null;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  loading: boolean;
}

export function PortfolioHeader({
  summary,
  timeframe,
  onTimeframeChange,
  loading,
}: PortfolioHeaderProps) {
  const [csvMenuOpen, setCsvMenuOpen] = useState(false);

  const chartData = useMemo(() => {
    if (!summary?.history) return [];
    if (timeframe === "24H") {
      return summary.history.slice(-8);
    }
    if (timeframe === "7D") {
      return summary.history.slice(-14);
    }
    return summary.history;
  }, [summary?.history, timeframe]);

  const netWorthUsd = summary?.totalNetWorthUsd ?? 0;
  const netWorthEtn = summary?.totalNetWorthEtn ?? 0;
  const changeUsd = summary?.change24hUsd ?? 0;
  const changePercent = summary?.change24hPercent ?? 0;
  const isPositive = changePercent >= 0;

  const handleExportSnapshot = () => {
    if (!summary) return;
    exportPortfolioSnapshotCsv(summary);
    setCsvMenuOpen(false);
  };

  const handleExportTaxLedger = () => {
    if (!summary) return;
    exportTaxLedgerCsv(summary, summary.intelligence?.recentTransactions ?? []);
    setCsvMenuOpen(false);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-7 shadow-2xl backdrop-blur-xl">
      {/* Top cyan gradient highlight line */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none" />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Net Worth Balances & Badges */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-slate-400">
              Total Net Worth
            </span>

            {/* Bundle Mode Active Pill */}
            {summary?.isBundle && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.25)]">
                <Layers className="h-3 w-3 text-amber-400" />
                Bundle: {summary.bundledAddresses?.length ?? 1} Wallets Combined
              </span>
            )}

            {/* Pro / Premium Preview Badge */}
            {IS_PREMIUM_USER && (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-2.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                <Crown className="h-3 w-3 text-cyan-300" />
                PRO PREVIEW
              </span>
            )}

            <span className="font-mono rounded-full border border-slate-800 bg-slate-950/60 px-2 py-0.5 text-[0.62rem] text-slate-400">
              1 ETN ≈ ${(summary?.etnUsdPrice ?? 0.00213).toFixed(5)}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-3">
            {loading && !summary ? (
              <div className="h-10 w-52 animate-pulse rounded-lg bg-slate-800/80" />
            ) : (
              <h1 className="font-mono text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                ${netWorthUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h1>
            )}

            <div
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold font-mono",
                isPositive
                  ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-400"
                  : "border border-rose-500/30 bg-rose-950/30 text-rose-400"
              )}
            >
              <TrendingUp className="h-3 w-3" />
              <span>
                {isPositive ? "+" : ""}
                {changePercent.toFixed(2)}% (+${changeUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })})
              </span>
            </div>
          </div>

          <p className="font-mono text-xs sm:text-sm text-slate-400">
            ≈ {netWorthEtn.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
            <span className="text-cyan-400 font-semibold">ETN</span>
          </p>
        </div>

        {/* Right: Controls (Export CSV PRO + Timeframe Switcher) */}
        <div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
          {/* CSV Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              disabled={!summary}
              onClick={() => setCsvMenuOpen((prev) => !prev)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs font-medium text-slate-300 transition duration-200 hover:border-slate-700 hover:text-white disabled:opacity-50"
              )}
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              <span>Export CSV</span>
              {IS_PREMIUM_USER && (
                <span className="rounded bg-cyan-400/20 border border-cyan-400/40 px-1 py-0.2 text-[0.55rem] font-bold uppercase tracking-wider text-cyan-300">
                  PRO
                </span>
              )}
              <ChevronDown className="h-3 w-3 text-slate-500" />
            </button>

            {csvMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setCsvMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-slate-800 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={handleExportSnapshot}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-300 hover:bg-slate-900 hover:text-cyan-300 transition"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-cyan-400" />
                    <div>
                      <div className="font-semibold">Portfolio Snapshot</div>
                      <div className="text-[0.62rem] text-slate-500">Balances, values & PnL</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportTaxLedger}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-300 hover:bg-slate-900 hover:text-cyan-300 transition"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                    <div>
                      <div className="font-semibold">Tax & Accounting Ledger</div>
                      <div className="text-[0.62rem] text-slate-500">History, fees & receipts</div>
                    </div>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Timeframe Switcher */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950/70 p-1">
            {(["24H", "7D", "30D"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => onTimeframeChange(tf)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                  timeframe === tf
                    ? "bg-cyan-400 text-slate-950 shadow-glow"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sparkline / Area Chart of Portfolio Value */}
      <div className="mt-6 h-36 w-full pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
            <defs>
              <linearGradient id="cyanAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="dateStr" hide />
            <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload as { dateStr: string; valueUsd: number; valueEtn: number };
                  return (
                    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-2.5 shadow-xl backdrop-blur-md">
                      <p className="text-[0.65rem] text-slate-400">{data.dateStr}</p>
                      <p className="font-mono text-xs font-bold text-cyan-300">
                        ${data.valueUsd.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                      <p className="font-mono text-[0.62rem] text-slate-500">
                        {data.valueEtn.toLocaleString()} ETN
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey="valueUsd"
              stroke="#22d3ee"
              strokeWidth={2}
              fill="url(#cyanAreaGradient)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
