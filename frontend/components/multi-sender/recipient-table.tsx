"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowDownUp,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Info,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  Wand2,
  X,
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
  onQuickPaste: () => void;
  onAutoFillTokenIds: (startId: number) => void;
  onRemoveInvalidRows: () => void;
  onRemoveDuplicates: () => void;
  onMergeDuplicates: (isErc721?: boolean) => void;
  onClearAll: () => void;
  onExportCsv: (symbol: string, isErc721?: boolean) => void;
  selfAddress?: string | null;
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
  onQuickPaste,
  onAutoFillTokenIds,
  onRemoveInvalidRows,
  onRemoveDuplicates,
  onMergeDuplicates,
  onClearAll,
  onExportCsv,
  selfAddress,
  asset = "native",
  nftStandard = "erc721",
  nftTokenId = "",
  onNftTokenIdChange,
}: RecipientTableProps) {
  const [uniform, setUniform] = useState("");
  const [startTokenId, setStartTokenId] = useState("1");
  const [showAutoFillDialog, setShowAutoFillDialog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [dedupMenuOpen, setDedupMenuOpen] = useState(false);

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

  const handleApplySequentialIds = () => {
    const num = Number.parseInt(startTokenId.trim(), 10);
    onAutoFillTokenIds(Number.isNaN(num) ? 1 : num);
    setShowAutoFillDialog(false);
  };

  return (
    <Card className="p-5">
      {/* Top Header & Entry Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/80 text-cyan-400">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-100 flex items-center gap-2">
              Recipients & Allocation
              <span className="font-mono rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[0.62rem] text-slate-400">
                {rows.length} {rows.length === 1 ? "row" : "rows"}
              </span>
            </h2>
            <p className="text-[0.68rem] text-slate-400">
              {isErc721
                ? "Enter recipient wallet addresses and unique NFT Token IDs"
                : isErc1155
                  ? "Enter recipient addresses and edition quantities"
                  : "Enter recipient addresses and amounts, validated dynamically"}
            </p>
          </div>
        </div>

        {/* Primary Import Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onQuickPaste}
            disabled={disabled}
            className="text-xs"
          >
            <ClipboardList className="h-3.5 w-3.5 text-cyan-400" />
            Paste Raw Text
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onBulkImport}
            disabled={disabled}
            className="text-xs shadow-sm"
          >
            <Upload className="h-3.5 w-3.5 text-cyan-400" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* RECIPIENT LIST MANAGEMENT & QUICK-ENTRY TOOLBAR */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-950/50 p-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Auto-Sequential Token ID Generator for ERC-721 */}
          {isErc721 ? (
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAutoFillDialog(!showAutoFillDialog)}
                disabled={disabled || rows.length === 0}
                className="h-7 text-[0.68rem] border-cyan-500/30 text-cyan-300"
              >
                <Sparkles className="h-3 w-3" />
                Auto-fill IDs
              </Button>

              {showAutoFillDialog ? (
                <div className="absolute left-0 top-8 z-30 w-56 rounded-xl border border-slate-800 bg-slate-950 p-3 shadow-2xl">
                  <p className="text-[0.68rem] font-semibold text-slate-200">
                    Auto-Fill Sequential IDs
                  </p>
                  <p className="mt-0.5 text-[0.62rem] text-slate-400">
                    Starting ID across {rows.length} rows:
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      type="number"
                      value={startTokenId}
                      onChange={(e) => setStartTokenId(e.target.value)}
                      placeholder="1"
                      className="font-mono h-7 text-xs"
                    />
                    <Button
                      type="button"
                      variant="glow"
                      size="sm"
                      onClick={handleApplySequentialIds}
                      className="h-7 text-xs px-2.5"
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Deduplication Handler */}
          <div className="relative">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDedupMenuOpen(!dedupMenuOpen)}
              disabled={disabled || rows.length === 0}
              className={cn(
                "h-7 text-[0.68rem] gap-1",
                parsed.duplicateCount > 0 ? "border-amber-500/40 text-amber-300 bg-amber-950/20" : ""
              )}
            >
              <ArrowDownUp className="h-3 w-3" />
              Deduplicate
              {parsed.duplicateCount > 0 ? (
                <span className="font-mono rounded-full bg-amber-500/20 px-1 text-[0.6rem] font-bold">
                  {parsed.duplicateCount}
                </span>
              ) : null}
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </Button>

            {dedupMenuOpen ? (
              <div
                className="absolute left-0 top-8 z-30 w-48 rounded-xl border border-slate-800 bg-slate-950 p-1.5 shadow-2xl space-y-1"
                onMouseLeave={() => setDedupMenuOpen(false)}
              >
                {!isErc721 ? (
                  <button
                    type="button"
                    onClick={() => {
                      onMergeDuplicates(false);
                      setDedupMenuOpen(false);
                    }}
                    className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800/60 hover:text-cyan-300 transition"
                  >
                    Merge duplicates (Sum amounts)
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    onRemoveDuplicates();
                    setDedupMenuOpen(false);
                  }}
                  className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-300 hover:bg-slate-800/60 hover:text-cyan-300 transition"
                >
                  Remove duplicates (Keep first)
                </button>
              </div>
            ) : null}
          </div>

          {/* Purge Invalid Rows */}
          {parsed.issueCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRemoveInvalidRows}
              disabled={disabled}
              className="h-7 text-[0.68rem] border-rose-500/40 text-rose-300 hover:bg-rose-950/20"
            >
              <Trash2 className="h-3 w-3" />
              Remove Invalid ({parsed.issueCount})
            </Button>
          ) : null}
        </div>

        {/* Right side utilities: Export & Clear */}
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onExportCsv(symbol, isErc721)}
            disabled={disabled || rows.length === 0}
            className="h-7 text-[0.68rem] text-slate-400 hover:text-slate-200"
          >
            <Download className="h-3 w-3" />
            Export CSV
          </Button>

          {showClearConfirm ? (
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              <span className="text-[0.62rem] text-slate-400 px-1.5">Clear all?</span>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  onClearAll();
                  setShowClearConfirm(false);
                }}
                className="h-6 text-[0.62rem] px-2"
              >
                Yes
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowClearConfirm(false)}
                className="h-6 text-[0.62rem] px-1.5"
              >
                No
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowClearConfirm(true)}
              disabled={disabled || rows.length === 0}
              className="h-7 text-[0.68rem] text-slate-500 hover:text-rose-400"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ERC-1155 Global Token ID input */}
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
            Every recipient below will receive their specified edition quantity of this Token ID.
          </span>
        </div>
      ) : null}

      {/* Uniform Amount Toolbar (for Native / Tokens / ERC-1155) */}
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
            Cap: {rows.length} of {MAX_RECIPIENT_ROWS} recipients
          </span>
        </div>
      ) : null}

      {/* Recipient Interactive Data Table */}
      <div className="mt-3 max-h-[30rem] overflow-auto rounded-xl border border-slate-800 bg-slate-950/40">
        <table className="w-full min-w-[38rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md">
            <tr className="border-b border-slate-800 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
              <th scope="col" className="w-10 px-3 py-2.5 font-medium">
                #
              </th>
              <th scope="col" className="w-28 px-3 py-2.5 font-medium">
                Status
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Wallet address
              </th>
              <th scope="col" className="w-36 px-3 py-2.5 font-medium">
                {columnLabel}
              </th>
              <th scope="col" className="w-10 px-2 py-2.5 text-center">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/70">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-xs text-slate-500">
                  No recipients yet — click &quot;Add recipient&quot; or paste/import a list above.
                </td>
              </tr>
            ) : null}

            {rows.map((draft, index) => {
              const row = parsed.drafts[index];
              const issue = row?.issue ?? null;
              const warning = row?.warning ?? null;
              const addressInvalid = issue !== null && ADDRESS_ISSUES.includes(issue);
              const amountInvalid = issue !== null && AMOUNT_ISSUES.includes(issue);
              const isPristine = row?.pristine ?? false;

              const isSelfTransfer =
                Boolean(
                  selfAddress &&
                    draft.address.trim() &&
                    draft.address.trim().toLowerCase() === selfAddress.toLowerCase()
                );

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

              // Row Status Calculation
              const isValid =
                !isPristine &&
                issue === null &&
                row?.address !== null &&
                (isErc721 ? /^\d+$/.test(draft.amount.trim()) : row?.amountWei !== null);

              return (
                <tr
                  key={draft.id}
                  className={cn(
                    "transition-colors align-top",
                    addressInvalid
                      ? "bg-rose-950/15"
                      : isSelfTransfer
                        ? "bg-cyan-950/10"
                        : "hover:bg-slate-800/20"
                  )}
                >
                  {/* # Index Column */}
                  <td className="font-mono px-3 py-3 text-[0.68rem] text-slate-500">
                    {index + 1}
                  </td>

                  {/* Status Badge Column */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {isPristine ? (
                      <span className="font-mono text-[0.62rem] text-slate-600">Empty</span>
                    ) : addressInvalid ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-950/40 px-2 py-0.5 text-[0.62rem] font-medium text-rose-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_#f43f5e]" />
                        Malformed
                      </span>
                    ) : amountInvalid ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-950/40 px-2 py-0.5 text-[0.62rem] font-medium text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]" />
                        Invalid Value
                      </span>
                    ) : isSelfTransfer ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-950/40 px-2 py-0.5 text-[0.62rem] font-medium text-cyan-300">
                        <User className="h-3 w-3 text-cyan-400" />
                        Self-Transfer
                      </span>
                    ) : isValid ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-[0.62rem] font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                        Valid
                      </span>
                    ) : null}
                  </td>

                  {/* Wallet Address Input */}
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
                    ) : isSelfTransfer ? (
                      <p className="mt-1 flex items-center gap-1 text-[0.62rem] leading-snug text-cyan-300/90 font-mono">
                        <Info className="h-3 w-3 text-cyan-400" />
                        Notice: This is your actively connected wallet address
                      </p>
                    ) : warning && addressMessage ? (
                      <p className="mt-1 text-[0.62rem] leading-snug text-amber-400">
                        {addressMessage}
                      </p>
                    ) : null}
                  </td>

                  {/* Amount / Quantity / Token ID Input */}
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

                  {/* Remove Row Button */}
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

      {/* Add Recipient Row Action */}
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
