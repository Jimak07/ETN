"use client";

import { useCallback, useMemo, useState } from "react";

import {
  MAX_RECIPIENT_ROWS,
  parseRecipientRows,
  type ParsedTable,
  type RecipientDraft,
} from "@/lib/multi-sender/parse";

const INITIAL_ROWS = 3;

let sequence = 0;

export function createDraftRow(): RecipientDraft {
  sequence += 1;
  return { id: `recipient-${sequence}`, address: "", amount: "" };
}

export function createDraftRows(count: number): RecipientDraft[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, createDraftRow);
}

export type RecipientSeed = Omit<RecipientDraft, "id">;

export interface RecipientRowsApi {
  rows: RecipientDraft[];
  parsed: ParsedTable;
  update: (id: string, field: "address" | "amount", value: string) => void;
  addRow: () => void;
  appendRows: (rows: readonly RecipientSeed[]) => void;
  replaceRows: (rows: readonly RecipientSeed[]) => void;
  removeRow: (id: string) => void;
  applyUniformAmount: (amount: string) => void;
  autoFillTokenIds: (startId: number) => void;
  removeInvalidRows: () => void;
  removeDuplicates: () => void;
  mergeDuplicates: (isErc721?: boolean) => void;
  clearAll: () => void;
  exportCsv: (symbol: string, isErc721?: boolean) => void;
  clear: () => void;
}

function sumAmounts(a: string, b: string): string {
  const numA = Number.parseFloat(a.replace(/,/g, ""));
  const numB = Number.parseFloat(b.replace(/,/g, ""));
  if (Number.isNaN(numA)) return b;
  if (Number.isNaN(numB)) return a;
  const sum = numA + numB;
  return Number.isInteger(sum) ? sum.toString() : sum.toFixed(6).replace(/\.?0+$/, "");
}

export function useRecipientRows(
  decimals: number,
  selfAddress: string | null,
  initialRows: number = INITIAL_ROWS,
): RecipientRowsApi {
  const [rows, setRows] = useState<RecipientDraft[]>(() => createDraftRows(initialRows));

  const update = useCallback((id: string, field: "address" | "amount", value: string) => {
    setRows((previous) =>
      previous.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((previous) =>
      previous.length >= MAX_RECIPIENT_ROWS ? previous : [...previous, createDraftRow()],
    );
  }, []);

  const appendRows = useCallback((incoming: readonly RecipientSeed[]) => {
    if (incoming.length === 0) return;
    setRows((previous) => {
      // If previous only has a single pristine row, replace it instead of keeping an empty row on top
      const filteredPrev =
        previous.length === 1 && !previous[0].address.trim() && !previous[0].amount.trim()
          ? []
          : previous;
      const capacity = MAX_RECIPIENT_ROWS - filteredPrev.length;
      const allowed = incoming.slice(0, Math.max(0, capacity));
      return [
        ...filteredPrev,
        ...allowed.map((row) => ({ ...row, id: createDraftRow().id })),
      ];
    });
  }, []);

  const replaceRows = useCallback((incoming: readonly RecipientSeed[]) => {
    const allowed = incoming.slice(0, MAX_RECIPIENT_ROWS);
    setRows(allowed.length > 0 ? allowed.map((row) => ({ ...row, id: createDraftRow().id })) : createDraftRows(1));
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((previous) => {
      const remaining = previous.filter((row) => row.id !== id);
      return remaining.length > 0 ? remaining : createDraftRows(1);
    });
  }, []);

  const applyUniformAmount = useCallback((amount: string) => {
    setRows((previous) => previous.map((row) => ({ ...row, amount })));
  }, []);

  const autoFillTokenIds = useCallback((startId: number) => {
    const validStart = Number.isInteger(startId) && startId >= 0 ? startId : 1;
    setRows((previous) =>
      previous.map((row, index) => ({
        ...row,
        amount: String(validStart + index),
      })),
    );
  }, []);

  const clearAll = useCallback(() => {
    setRows(createDraftRows(1));
  }, []);

  const clear = useCallback(() => setRows([]), []);

  const parsed = useMemo(
    () => parseRecipientRows(rows, { decimals, selfAddress }),
    [rows, decimals, selfAddress],
  );

  const removeInvalidRows = useCallback(() => {
    setRows((previous) => {
      const validRows = previous.filter((_, idx) => {
        const draftRow = parsed.drafts[idx];
        if (!draftRow) return false;
        // Keep rows that are completely valid
        return draftRow.issue === null && draftRow.address !== null && draftRow.amountWei !== null;
      });
      return validRows.length > 0 ? validRows : createDraftRows(1);
    });
  }, [parsed.drafts]);

  const removeDuplicates = useCallback(() => {
    setRows((previous) => {
      const seen = new Set<string>();
      const deduplicated: RecipientDraft[] = [];
      for (const row of previous) {
        const key = row.address.trim().toLowerCase();
        if (!key) {
          deduplicated.push(row);
          continue;
        }
        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push(row);
        }
      }
      return deduplicated.length > 0 ? deduplicated : createDraftRows(1);
    });
  }, []);

  const mergeDuplicates = useCallback((isErc721 = false) => {
    setRows((previous) => {
      if (isErc721) {
        // In ERC-721, each row is a unique NFT token ID, so merging values is not numeric summation
        const seen = new Set<string>();
        const deduped = previous.filter((row) => {
          const key = row.address.trim().toLowerCase();
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return deduped.length > 0 ? deduped : createDraftRows(1);
      }

      const map = new Map<string, RecipientDraft>();
      for (const row of previous) {
        const key = row.address.trim().toLowerCase();
        if (!key) continue;
        if (map.has(key)) {
          const existing = map.get(key)!;
          const mergedAmount = sumAmounts(existing.amount, row.amount);
          map.set(key, { ...existing, amount: mergedAmount });
        } else {
          map.set(key, { ...row, id: createDraftRow().id });
        }
      }

      const merged = Array.from(map.values());
      return merged.length > 0 ? merged : createDraftRows(1);
    });
  }, []);

  const exportCsv = useCallback((symbol: string, isErc721 = false) => {
    const nonBlank = rows.filter((r) => r.address.trim() || r.amount.trim());
    if (nonBlank.length === 0) return;
    const header = `address,${isErc721 ? "token_id" : `amount_${symbol}`}`;
    const lines = nonBlank.map((r) => `"${r.address.trim()}","${r.amount.trim()}"`);
    const content = [header, ...lines].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recipients-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [rows]);

  return {
    rows,
    parsed,
    update,
    addRow,
    appendRows,
    replaceRows,
    removeRow,
    applyUniformAmount,
    autoFillTokenIds,
    removeInvalidRows,
    removeDuplicates,
    mergeDuplicates,
    clearAll,
    exportCsv,
    clear,
  };
}
