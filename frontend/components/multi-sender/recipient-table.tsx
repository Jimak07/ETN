"use client";

import { Plus, Trash2, Upload, Users, Wand2 } from "lucide-react";
import { useId, useState } from "react";

import { GlassCard, SectionHeading } from "@/components/ui/glass-card";
import { cn } from "@/lib/cn";
import {
  ROW_ISSUE_COPY,
  ROW_WARNING_COPY,
  type ParsedTable,
  type RecipientDraft,
  type RowIssue,
} from "@/lib/multi-sender/parse";

/**
 * The recipient list as an editable table.
 *
 * Rows are validated on every keystroke and never reordered or dropped, so the
 * `#` column always means the same row the user is looking at: an airdrop is a
 * list of who-gets-what, and a row that silently moves while being typed is the
 * fastest way to pay the wrong wallet.
 *
 * Amounts are `inputMode="decimal"` text inputs rather than `type="number"`:
 * number inputs reject a trailing decimal point and the intermediate states of
 * ordinary typing, which would make entering "0.5" unreliable.
 */

/**
 * Table wording for two shared issues. The parser is also used for pasted
 * lists, where "on this line" is right and "in this row" is not.
 */
const TABLE_ISSUE_COPY: Partial<Record<RowIssue, string>> = {
  "missing-amount": "Enter an amount",
  "unexpected-columns": "One address and one amount per row",
};

const ADDRESS_ISSUES: readonly RowIssue[] = [
  "invalid-address",
  "invalid-checksum",
  "unexpected-columns",
];
const AMOUNT_ISSUES: readonly RowIssue[] = ["missing-amount", "invalid-amount", "zero-amount"];

interface RecipientTableProps {
  rows: readonly RecipientDraft[];
  /** The same rows, validated - indexed 1:1 with `rows`. */
  parsed: ParsedTable;
  symbol: string;
  decimals: number;
  disabled?: boolean;
  onUpdate: (id: string, field: "address" | "amount", value: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onApplyUniformAmount: (amount: string) => void;
  onBulkImport: () => void;
}

export function RecipientTable({
  rows,
  parsed,
  symbol,
  decimals,
  disabled = false,
  onUpdate,
  onRemove,
  onAdd,
  onApplyUniformAmount,
  onBulkImport,
}: RecipientTableProps) {
  const [uniform, setUniform] = useState("");
  const uniformId = useId();

  const applyUniform = () => {
    if (rows.length === 0 || uniform.trim().length === 0) return;
    onApplyUniformAmount(uniform.trim());
  };
  const canApplyUniform = !disabled && rows.length > 0 && uniform.trim().length > 0;

  return (
    <GlassCard className="p-5">
      <SectionHeading
        title="Recipients"
        subtitle="One row per wallet, validated as you type"
        icon={<Users className="h-4 w-4" />}
        action={
          <button
            type="button"
            onClick={onBulkImport}
            disabled={disabled}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[0.68rem] font-medium text-slate-400 transition",
              "hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50",
            )}
          >
            <Upload className="h-3 w-3" />
            Bulk import
          </button>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
        <Wand2 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
        <label htmlFor={uniformId} className="text-[0.68rem] font-medium text-slate-400">
          Apply uniform amount
        </label>
        <input
          id={uniformId}
          value={uniform}
          onChange={(event) => setUniform(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canApplyUniform) {
              event.preventDefault();
              applyUniform();
            }
          }}
          disabled={disabled}
          inputMode="decimal"
          placeholder="0.00"
          className={cn(
            "num w-24 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-xs text-slate-200",
            "placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20",
            "disabled:opacity-60",
          )}
        />
        <span className="num text-[0.62rem] text-slate-500">{symbol}</span>
        <button
          type="button"
          onClick={applyUniform}
          disabled={!canApplyUniform}
          className={cn(
            "rounded-lg border px-2.5 py-1 text-[0.68rem] font-medium transition",
            canApplyUniform
              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/20"
              : "cursor-not-allowed border-slate-800 text-slate-600",
          )}
        >
          Apply to all
        </button>
        <span className="num ml-auto text-[0.68rem] text-slate-500">
          {rows.length} row{rows.length === 1 ? "" : "s"} · {decimals} decimals
        </span>
      </div>

      <div className="mt-2 max-h-[28rem] overflow-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-md">
            <tr className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-slate-500">
              <th scope="col" className="w-10 px-3 py-2 font-medium">
                #
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                Wallet address
              </th>
              <th scope="col" className="w-32 px-2 py-2 font-medium">
                Amount ({symbol})
              </th>
              <th scope="col" className="w-12 px-2 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-[0.7rem] text-slate-500">
                  No recipients yet - add a row, or bulk import a list.
                </td>
              </tr>
            ) : null}

            {rows.map((draft, index) => {
              const row = parsed.drafts[index];
              const issue = row?.issue ?? null;
              const warning = row?.warning ?? null;
              const addressInvalid = issue !== null && ADDRESS_ISSUES.includes(issue);
              const amountInvalid = issue !== null && AMOUNT_ISSUES.includes(issue);

              const addressMessage =
                issue !== null && addressInvalid
                  ? (TABLE_ISSUE_COPY[issue] ?? ROW_ISSUE_COPY[issue])
                  : warning !== null
                    ? ROW_WARNING_COPY[warning]
                    : null;
              const amountMessage =
                issue !== null && amountInvalid ? (TABLE_ISSUE_COPY[issue] ?? ROW_ISSUE_COPY[issue]) : null;

              return (
                <tr key={draft.id} className="border-t border-slate-800/70 align-top">
                  <td className="num px-3 py-2.5 text-[0.68rem] text-slate-500">{index + 1}</td>

                  <td className="px-2 py-2">
                    <input
                      value={draft.address}
                      onChange={(event) => onUpdate(draft.id, "address", event.target.value)}
                      disabled={disabled}
                      spellCheck={false}
                      placeholder="0x..."
                      aria-label={`Wallet address, row ${index + 1}`}
                      aria-invalid={addressInvalid}
                      className={cn(
                        "num w-full rounded-lg border bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200",
                        "placeholder:text-slate-600 focus:outline-none focus:ring-2",
                        addressInvalid
                          ? "border-status-offline/60 focus:border-status-offline/70 focus:ring-status-offline/15"
                          : "border-slate-800 focus:border-cyan-500/50 focus:ring-cyan-500/20",
                        "disabled:opacity-60",
                      )}
                    />
                    {addressMessage ? (
                      <p
                        className={cn(
                          "mt-1 text-[0.62rem] leading-snug",
                          addressInvalid ? "text-status-offline" : "text-status-degraded",
                        )}
                      >
                        {addressMessage}
                      </p>
                    ) : null}
                  </td>

                  <td className="px-2 py-2">
                    <input
                      value={draft.amount}
                      onChange={(event) => onUpdate(draft.id, "amount", event.target.value)}
                      disabled={disabled}
                      inputMode="decimal"
                      placeholder="0.00"
                      aria-label={`Amount, row ${index + 1}`}
                      aria-invalid={amountInvalid}
                      className={cn(
                        "num w-full rounded-lg border bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-200",
                        "placeholder:text-slate-600 focus:outline-none focus:ring-2",
                        amountInvalid
                          ? "border-status-offline/60 focus:border-status-offline/70 focus:ring-status-offline/15"
                          : "border-slate-800 focus:border-cyan-500/50 focus:ring-cyan-500/20",
                        "disabled:opacity-60",
                      )}
                    />
                    {amountMessage ? (
                      <p className="mt-1 text-[0.62rem] leading-snug text-status-offline">{amountMessage}</p>
                    ) : null}
                  </td>

                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(draft.id)}
                      disabled={disabled}
                      aria-label={`Remove row ${index + 1}`}
                      className="rounded-lg border border-slate-800 p-1.5 text-slate-500 transition hover:border-status-offline/40 hover:text-status-offline disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        className={cn(
          "mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-700/80 px-3 py-2.5 text-xs font-medium text-slate-400 transition duration-200 ease-out-expo",
          "hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50",
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        Add recipient
      </button>
    </GlassCard>
  );
}
