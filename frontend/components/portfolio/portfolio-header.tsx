"use client";

import { useMemo } from "react";
import { ArrowUpRight, Crown, Flame, Sparkles, TrendingUp } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { IS_PREMIUM_USER } from "@/lib/constants/myverse";
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

        {/* Right: Timeframe Switcher */}
        <div className="flex items-center gap-1.5 self-start lg:self-center rounded-xl border border-slate-800 bg-slate-950/70 p-1">
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
