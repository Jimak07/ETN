"use client";

import { motion, useReducedMotion } from "framer-motion";
import { CircleAlert, CircleCheck, Copy, ListChecks } from "lucide-react";
import { useMemo, useState } from "react";

import { GlassCard, SectionHeading } from "@/components/ui/glass-card";
import { cn } from "@/lib/cn";
import {
  ROW_ISSUE_COPY,
  ROW_WARNING_COPY,
  formatTokenAmount,
  type ParsedList,
  type RecipientRow,
} from "@/lib/multi-sender/parse";

/**
 * Live validation dashboard.
 *
 * Renders a windowed view rather than the whole list: a 5,000-row CSV would
 * otherwise mount 5,000 DOM rows on every keystroke. Problems are always shown,
 * then valid rows fill whatever budget is left, so the thing the user must act
 * on can never be the thing that gets truncated away.
 */

const ROW_BUDGET = 200;

type Filter = "all" | "problems";

function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

interface ValidationPanelProps {
  parsed: ParsedList;
  symbol: string;
  decimals: number;
}

function RowStatus({ row }: { row: RecipientRow }) {
  if (row.issue) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-medium text-status-offline">
        <CircleAlert className="h-3 w-3 shrink-0" />
        {ROW_ISSUE_COPY[row.issue]}
      </span>
    );
  }

  if (row.warning) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-medium text-status-degraded">
        <Copy className="h-3 w-3 shrink-0" />
        {ROW_WARNING_COPY[row.warning]}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[0.68rem] font-medium text-status-healthy">
      <CircleCheck className="h-3 w-3 shrink-0" />
      Ready
    </span>
  );
}

export function ValidationPanel({ parsed, symbol, decimals }: ValidationPanelProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const reduceMotion = useReducedMotion();

  const visible = useMemo(() => {
    const source = filter === "problems" ? parsed.rows.filter((row) => row.issue !== null) : parsed.rows;
    if (source.length <= ROW_BUDGET) return { rows: source, hidden: 0 };

    if (filter === "problems") return { rows: source.slice(0, ROW_BUDGET), hidden: source.length - ROW_BUDGET };

    const problems = source.filter((row) => row.issue !== null);
    const valid = source.filter((row) => row.issue === null);
    const budget = Math.max(0, ROW_BUDGET - problems.length);

    return {
      rows: [...problems, ...valid.slice(0, budget)],
      hidden: source.length - problems.length - budget,
    };
  }, [filter, parsed.rows]);

  const validCount = parsed.valid.length;

  return (
    <GlassCard className="p-5">
      <SectionHeading
        title="Validation"
        subtitle="Parsed locally as you type - nothing is sent to a server"
        icon={<ListChecks className="h-4 w-4" />}
        action={
          <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 p-1">
            {(["all", "problems"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={cn(
                  "relative rounded-full px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] transition",
                  filter === option ? "text-slate-950" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {filter === option ? (
                  <motion.span
                    layoutId="validation-filter"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-full bg-slate-200"
                  />
                ) : null}
                <span className="relative">{option === "all" ? "All" : "Problems"}</span>
              </button>
            ))}
          </div>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Ready", value: validCount, tone: "text-status-healthy", wide: false },
          {
            label: "Invalid",
            value: parsed.issueCount,
            tone: parsed.issueCount > 0 ? "text-status-offline" : "text-slate-300",
            wide: false,
          },
          {
            label: "Duplicates",
            value: parsed.duplicateCount,
            tone: parsed.duplicateCount > 0 ? "text-status-degraded" : "text-slate-300",
            wide: false,
          },
          {
            label: "To send",
            value: `${formatTokenAmount(parsed.totalWei, decimals, 4)} ${symbol}`,
            tone: "text-cyan-300",
            wide: true,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className={cn(
              "rounded-xl border border-slate-800/80 bg-slate-950/40 px-3 py-2.5",
              stat.wide && "col-span-2 sm:col-span-1",
            )}
          >
            <p className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-slate-500">
              {stat.label}
            </p>
            <motion.p
              key={String(stat.value)}
              initial={reduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={cn("num mt-1 truncate text-sm font-semibold", stat.tone)}
            >
              {stat.value}
            </motion.p>
          </div>
        ))}
      </div>

      {parsed.rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 px-3.5 py-6 text-center text-xs text-slate-500">
          Paste a list or drop a CSV to validate it instantly.
        </p>
      ) : (
        <>
          <div className="mt-3 max-h-[22rem] overflow-y-auto rounded-xl border border-slate-800/80">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md">
                <tr className="text-[0.62rem] uppercase tracking-[0.14em] text-slate-500">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Address</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.rows.map((row, index) => (
                  <tr
                    key={`${row.line}-${row.rawAddress}-${index}`}
                    className={cn(
                      "border-t border-slate-800/60 transition-colors",
                      row.issue
                        ? "bg-status-offline/[0.06]"
                        : row.warning
                          ? "bg-status-degraded/[0.05]"
                          : "hover:bg-slate-900/40",
                    )}
                  >
                    <td className="num px-3 py-2 text-slate-600">{row.line}</td>
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "num",
                          row.issue
                            ? "text-status-offline"
                            : row.warning
                              ? "text-status-degraded"
                              : "text-slate-300",
                        )}
                        title={row.rawAddress}
                      >
                        {row.issue === "invalid-address"
                          ? row.rawAddress
                          : shortAddress(row.address ?? row.rawAddress)}
                      </span>
                    </td>
                    <td className="num px-3 py-2 text-right text-slate-300">
                      {row.amountWei === null ? (
                        <span className="text-slate-600">{row.rawAmount || "-"}</span>
                      ) : (
                        formatTokenAmount(row.amountWei, decimals, 6)
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <RowStatus row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="num mt-2 text-[0.68rem] text-slate-500">
            {visible.hidden > 0
              ? `Showing ${visible.rows.length} of ${parsed.rows.length} rows`
              : `${parsed.rows.length} row${parsed.rows.length === 1 ? "" : "s"}`}
            {parsed.duplicateCount > 0
              ? ` - ${parsed.duplicateCount} duplicate address${parsed.duplicateCount === 1 ? "" : "es"} will be paid twice`
              : ""}
          </p>
        </>
      )}
    </GlassCard>
  );
}
