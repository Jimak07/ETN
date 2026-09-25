"use client";

import { useCallback, useMemo, useState } from "react";

import {
  parseRecipientRows,
  type ParsedTable,
  type RecipientDraft,
} from "@/lib/multi-sender/parse";

/**
 * The recipient table's rows and everything that edits them.
 *
 * Rows are held as raw strings and validated on every render, the same way the
 * pasted-list parser worked: the table has to answer "is this row sendable?" on
 * each keystroke, so there is no separate "validate" step that could be skipped
 * and no place for a half-parsed row to hide.
 *
 * Ids are generated here rather than derived from the row index because rows are
 * removed and appended: an index-keyed list makes React reuse the wrong input
 * when a row above the cursor disappears, which shows up as text jumping between
 * wallets.
 */

/** How many blank rows a fresh table starts with, so it reads as a form. */
const INITIAL_ROWS = 3;

let sequence = 0;

/** A new, empty row. Exported so the page can append without reaching into state. */
export function createDraftRow(): RecipientDraft {
  sequence += 1;
  return { id: `recipient-${sequence}`, address: "", amount: "" };
}

export function createDraftRows(count: number): RecipientDraft[] {
  return Array.from({ length: Math.max(0, Math.floor(count)) }, createDraftRow);
}

/** A row as handed in by an importer: the hook owns ids, so callers never invent one. */
export type RecipientSeed = Omit<RecipientDraft, "id">;

export interface RecipientRowsApi {
  rows: RecipientDraft[];
  parsed: ParsedTable;
  update: (id: string, field: "address" | "amount", value: string) => void;
  addRow: () => void;
  appendRows: (rows: readonly RecipientSeed[]) => void;
  replaceRows: (rows: readonly RecipientSeed[]) => void;
  removeRow: (id: string) => void;
  /** Sets the same amount on every row, for an even airdrop. */
  applyUniformAmount: (amount: string) => void;
  clear: () => void;
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
    setRows((previous) => [...previous, createDraftRow()]);
  }, []);

  const appendRows = useCallback((incoming: readonly RecipientSeed[]) => {
    if (incoming.length === 0) return;
    // Fresh ids: an import must never collide with a row already in the table.
    setRows((previous) => [
      ...previous,
      ...incoming.map((row) => ({ ...row, id: createDraftRow().id })),
    ]);
  }, []);

  const replaceRows = useCallback((incoming: readonly RecipientSeed[]) => {
    setRows(incoming.map((row) => ({ ...row, id: createDraftRow().id })));
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((previous) => previous.filter((row) => row.id !== id));
  }, []);

  const applyUniformAmount = useCallback((amount: string) => {
    setRows((previous) => previous.map((row) => ({ ...row, amount })));
  }, []);

  const clear = useCallback(() => setRows([]), []);

  const parsed = useMemo(
    () => parseRecipientRows(rows, { decimals, selfAddress }),
    [rows, decimals, selfAddress],
  );

  return { rows, parsed, update, addRow, appendRows, replaceRows, removeRow, applyUniformAmount, clear };
}
