"use client";

import {
  AlertCircle,
  Info,
  Plus,
  Trash2,
  Upload,
  Users,
  Wand2,
} from "lucide-react";
import { useId, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import {
  BATCH_CAP_NOTICE,
  MAX_RECIPIENT_ROWS,
  ROW_ISSUE_COPY,
  ROW_WARNING_COPY,
  type ParsedTable,
  type RecipientDraft,
  type RowIssue,
} from "@/lib/multi-sender/parse";

const TABLE_ISSUE_COPY: Partial<Record<RowIssue, string>> = {
  "invalid-address": "Invalid EVM wallet address format",
  "invalid-checksum": "Checksum mismatch - check capitalization typo",
  "missing-amount": "Enter an amount for this recipient",
  "unexpected-columns": "One address and one amount per row",
};

const ADDRESS_ISSUES: readonly RowIssue[] = [
  "invalid-address",
  "invalid-checksum",
  "unexpected-columns",
];
const AMOUNT_ISSUES: readonly RowIssue[] = [
  "missing-amount",
  "invalid-amount",
  "zero-amount",
];

interface RecipientTableProps {
  rows: readonly RecipientDraft[];
  parsed: ParsedTable;
  symbol: string;
  decimals: number;
  disabled?: boolean;
  onUpdate: (id: string, field: "address" | "amount", value: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onApplyUniformAmount: (amount: string) => void;
  onBulkImport: () => void;
  asset?: "native" | "popular" | "custom" | "nft";
  nftStandard?: "erc721" | "erc1155";
  nftTokenId?: string;
  onNftTokenIdChange?: (id: string) => void;
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
  asset = "native",
  nftStandard = "erc721",
  nftTokenId = "",
  onNftTokenIdChange,
}: RecipientTableProps) {
  const [uniform, setUniform] = useState("");
  const uniformId = useId();
  const nftGlobalId = useId();

  const applyUniform = () => {
    if (rows.length === 0 || uniform.trim().length === 0) return;
    onApplyUniformAmount(uniform.trim());
  };
  const canApplyUniform = !disabled && rows.length > 0 && uniform.trim().length > 0;
  const atCap = rows.length >= MAX_RECIPIENT_ROWS;

  const isErc721 = asset === "nft" && nftStandard === "erc721";
  const isErc1155 = asset === "nft" && nftStandard === "erc1155";

  const columnLabel = isErc721
    ? "Token ID"
    : isErc1155
      ? "Quantity"
      : `Amount (${symbol})`;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/80 text-cyan-400">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-100">
              Recipients & Allocation
            </h2>
            <p className="text-[0.68rem] text-slate-400">
              {isErc721
                ? "Enter recipient wallet addresses and unique NFT Token IDs"
                : isErc1155
                  ? "Enter recipient addresses and edition quantities"
                  : "Enter recipient addresses and amounts, validated as you type"}
            </p>
          </div>
        </div>

        {/* Prominent Import CSV Button */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onBulkImport}
          disabled={disabled}
          className="shadow-sm"
        >
          <Upload className="h-3.5 w-3.5 text-cyan-400" />
          Import CSV
        </Button>
      </div>

      <Notice
        tone="slate"
        icon={<Info className="h-4 w-4 text-cyan-300" />}
        title="Batch size limit"
        detail={BATCH_CAP_NOTICE}
        className="mt-4"
      />

      {isErc1155 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-xs">
          <label htmlFor={nftGlobalId} className="font-semibold text-cyan-300">
            ERC-1155 Token ID:
          </label>
          <input
            id={nftGlobalId}
            value={nftTokenId}
            onChange={(event) => onNftTokenIdChange?.(event.target.value)}
            disabled={disabled}
            placeholder="e.g. 1"
            className="font-mono w-28 rounded-lg border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
          />
          <span className="text-[0.68rem] text-slate-400">
            Every recipient below will receive their specified quantity of this Token ID edition.
          </span>
        </div>
      ) : null}

      {!isErc721 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2">
          <Wand2 className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
          <label htmlFor={uniformId} className="text-[0.68rem] font-medium text-slate-400">
            {isErc1155 ? "Apply uniform quantity" : "Apply uniform amount"}
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
            placeholder={isErc1155 ? "1" : "0.00"}
            className={cn(
              "font-mono w-24 rounded-lg border border-slate-800 bg-slate-950/60 px-2 py-1 text-xs text-slate-200",
              "placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20",
              "disabled:opacity-60"
            )}
          />
          <span className="font-mono text-[0.62rem] text-slate-500">{symbol}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={applyUniform}
            disabled={!canApplyUniform}
            className="h-6 px-2 text-[0.68rem]"
          >
            Apply to all
          </Button>
          <span
            className={cn(
              "font-mono ml-auto text-[0.68rem]",
              atCap ? "text-amber-400" : "text-slate-500"
            )}
          >
            {rows.length} row{rows.length === 1 ? "" : "s"} of {MAX_RECIPIENT_ROWS}
            {asset !== "nft" ? ` · ${decimals} decimals` : ""}
          </span>
        </div>
      ) : null}

      {/* Recipient Table */}
      <div className="mt-3 max-h-[30rem] overflow-auto rounded-xl border border-slate-800 bg-slate-950/40">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md">
            <tr className="border-b border-slate-800 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
              <th scope="col" className="w-10 px-3 py-2.5 font-medium">
                #
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Wallet address
              </th>
              <th scope="col" className="w-36 px-3 py-2.5 font-medium">
                {columnLabel}
              </th>
              <th scope="col" className="w-12 px-2 py-2.5 text-center">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/70">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-12 text-center text-xs text-slate-500">
                  No recipients yet - click &quot;Add recipient&quot; or import a CSV file above.
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
                  ? TABLE_ISSUE_COPY[issue] ?? ROW_ISSUE_COPY[issue]
                  : warning !== null
                    ? ROW_WARNING_COPY[warning]
                    : null;
              const amountMessage =
                issue !== null && amountInvalid
                  ? TABLE_ISSUE_COPY[issue] ?? ROW_ISSUE_COPY[issue]
                  : null;

              return (
                <tr
                  key={draft.id}
                  className={cn(
                    "transition-colors align-top",
                    addressInvalid ? "bg-rose-950/15" : "hover:bg-slate-800/20"
                  )}
                >
                  <td className="font-mono px-3 py-3 text-[0.68rem] text-slate-500">
                    {index + 1}
                  </td>

                  <td className="px-3 py-2.5">
                    <Input
                      value={draft.address}
                      onChange={(event) => onUpdate(draft.id, "address", event.target.value)}
                      disabled={disabled}
                      spellCheck={false}
                      placeholder="0x..."
                      error={addressInvalid}
                      aria-label={`Wallet address, row ${index + 1}`}
                      aria-invalid={addressInvalid}
                      className={cn(
                        "font-mono text-xs",
                        addressInvalid &&
                          "border-rose-500/70 bg-rose-950/30 text-rose-200 focus-visible:border-rose-400 focus-visible:ring-rose-500/20"
                      )}
                    />

                    {/* Inline Error Alert Component for malformed addresses */}
                    {addressInvalid && addressMessage ? (
                      <Alert variant="destructive" className="mt-1.5 py-1 px-2.5 text-[0.68rem]">
                        <AlertCircle className="h-3 w-3" />
                        <AlertDescription className="font-medium">
                          {addressMessage}
                        </AlertDescription>
                      </Alert>
                    ) : warning && addressMessage ? (
                      <p className="mt-1 text-[0.62rem] leading-snug text-amber-400">
                        {addressMessage}
                      </p>
                    ) : null}
                  </td>

                  <td className="px-3 py-2.5">
                    <Input
                      value={draft.amount}
                      onChange={(event) => onUpdate(draft.id, "amount", event.target.value)}
                      disabled={disabled}
                      inputMode={asset === "nft" ? "numeric" : "decimal"}
                      placeholder={asset === "nft" ? "1" : "0.00"}
                      error={amountInvalid}
                      aria-label={
                        isErc721
                          ? `Token ID, row ${index + 1}`
                          : isErc1155
                            ? `Quantity, row ${index + 1}`
                            : `Amount, row ${index + 1}`
                      }
                      aria-invalid={amountInvalid}
                      className="font-mono text-xs"
                    />
                    {amountMessage ? (
                      <p className="mt-1 text-[0.62rem] leading-snug text-rose-400">
                        {amountMessage}
                      </p>
                    ) : null}
                  </td>

                  <td className="px-2 py-2.5 text-center">
                    <button
                      type="button"
                      onClick={() => onRemove(draft.id)}
                      disabled={disabled}
                      aria-label={`Remove row ${index + 1}`}
                      className="rounded-lg border border-slate-800 p-1.5 text-slate-500 transition hover:border-rose-500/50 hover:text-rose-400 disabled:opacity-40"
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

      <Button
        type="button"
        variant="outline"
        onClick={onAdd}
        disabled={disabled || atCap}
        className={cn(
          "mt-3 w-full border-dashed",
          atCap
            ? "cursor-not-allowed border-slate-800 text-slate-600"
            : "border-slate-700/80 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300"
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        Add recipient
      </Button>

      {atCap ? (
        <p className="mt-1.5 text-center text-[0.62rem] leading-relaxed text-amber-400">
          Maximum cap of {MAX_RECIPIENT_ROWS} addresses reached. Please split larger lists into
          separate batch runs.
        </p>
      ) : null}
    </Card>
  );
}
