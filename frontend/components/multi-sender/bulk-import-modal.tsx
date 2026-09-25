"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileSpreadsheet, FlaskConical, Trash2, TriangleAlert, UploadCloud, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import type { RecipientSeed } from "@/hooks/use-recipient-rows";
import { cn } from "@/lib/cn";
import { ROW_ISSUE_COPY, parseRecipientList } from "@/lib/multi-sender/parse";

/**
 * Bulk import: the paste-and-drop door into the recipient table.
 *
 * The text is parsed with the same rules the table uses, so the preview here is
 * a genuine dry run rather than a second, more forgiving parser - what the modal
 * calls "needs attention" is exactly what will keep Send disabled afterwards.
 * Rows are imported as typed, problems included, because a bad line the user can
 * see and fix beats a line that quietly never made it into the batch.
 */

export type ImportMode = "append" | "replace";

/** Big enough for a 100k-row export, small enough not to wedge the tab. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * The table renders every row, so an import past this point is refused rather
 * than accepted into a tab that can no longer accept keystrokes.
 */
const MAX_IMPORT_ROWS = 2000;

const SAMPLE = [
  "address,amount",
  // Checksummed on purpose: a demo list should fail for the one obvious reason
  // it is meant to demonstrate, not on a subtly mistyped address.
  "0xA0f8ee187330ea22271714B815de18Cd74eBdc08,12.5",
  "0xD2aA558720EdeFbef16435Ed771Ee94E8f62C12E,48",
  "0x47A35A262186C0D76Ba5ca01a6262F120a25AD2B,7.25",
  "0x2d1d8168357EBf09aC6CD2B5911575A732F4dc43,150",
  "not-an-address,5",
].join("\n");

interface BulkImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: readonly RecipientSeed[], mode: ImportMode) => void;
  decimals: number;
  selfAddress: string | null;
  disabled?: boolean;
}

export function BulkImportModal({
  open,
  onClose,
  onImport,
  decimals,
  selfAddress,
  disabled = false,
}: BulkImportModalProps) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const parsed = useMemo(
    () => parseRecipientList(text, { decimals, selfAddress }),
    [decimals, selfAddress, text],
  );

  const seeds: RecipientSeed[] = useMemo(
    () => parsed.rows.map((row) => ({ address: row.rawAddress, amount: row.rawAmount })),
    [parsed.rows],
  );
  const problems = useMemo(() => parsed.rows.filter((row) => row.issue !== null), [parsed.rows]);
  const tooMany = seeds.length > MAX_IMPORT_ROWS;
  const canImport = !disabled && !tooMany && seeds.length > 0;

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const readFile = useCallback(async (file: File) => {
    setFileError(null);

    if (file.size > MAX_FILE_BYTES) {
      setFileError(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB - the limit is 2MB.`);
      return;
    }
    if (file.type && !/^(text\/|application\/(csv|vnd\.ms-excel))/.test(file.type)) {
      setFileError("Expected a .csv or .txt file of address, amount rows.");
      return;
    }

    try {
      const contents = await file.text();
      if (contents.trim().length === 0) {
        setFileError("That file is empty.");
        return;
      }
      setText(contents);
      setFileName(file.name);
    } catch {
      setFileError("Could not read that file. Try pasting the rows instead.");
    }
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void readFile(file);
    },
    [readFile],
  );

  const commit = useCallback(
    (mode: ImportMode) => {
      if (!canImport) return;
      onImport(seeds, mode);
      // Cleared on the way out so reopening the modal never offers to import
      // the same list twice.
      setText("");
      setFileName(null);
    },
    [canImport, onImport, seeds],
  );

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="bulk-import"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label="Bulk import recipients"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="glass-panel shadow-card w-full max-w-2xl p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-100">Bulk import</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Paste or drop a list of{" "}
                  <span className="num text-slate-400">address, amount</span> - a header row is skipped, and commas,
                  semicolons, tabs or spaces all separate the columns.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg border border-slate-800 p-1.5 text-slate-500 transition hover:border-slate-700 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div
              onDrop={onDrop}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current += 1;
                setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                // Depth counting: dragging over a child fires `leave` on the
                // parent, so a plain boolean flickers on every internal move.
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragging(false);
              }}
              className={cn(
                "mt-4 rounded-xl border border-dashed transition duration-300 ease-out-expo",
                dragging ? "border-cyan-400/70 bg-cyan-500/[0.06]" : "border-slate-700/80 bg-slate-950/40",
              )}
            >
              <textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setFileName(null);
                }}
                spellCheck={false}
                placeholder={"0x1234..., 12.5\n0xabcd..., 3"}
                aria-label="Recipients to import"
                className={cn(
                  "num h-40 w-full resize-y bg-transparent p-3 text-xs leading-relaxed text-slate-200",
                  "placeholder:text-slate-600 focus:outline-none",
                )}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 px-3 py-2">
                <span className="num text-[0.68rem] text-slate-500">
                  {fileName ? (
                    <span className="inline-flex items-center gap-1.5">
                      <FileSpreadsheet className="h-3 w-3 text-cyan-300" />
                      {fileName}
                    </span>
                  ) : (
                    "Drag a CSV anywhere in this box, or paste above"
                  )}
                </span>

                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setText(SAMPLE)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[0.68rem] font-medium text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300"
                  >
                    <FlaskConical className="h-3 w-3" />
                    Load sample
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setText("");
                      setFileName(null);
                      setFileError(null);
                    }}
                    disabled={text.length === 0 && fileName === null}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[0.68rem] font-medium text-slate-400 transition hover:border-status-offline/40 hover:text-status-offline disabled:opacity-40"
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[0.68rem] font-medium text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300"
                  >
                    <UploadCloud className="h-3 w-3" />
                    Choose CSV
                  </button>
                </span>

                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void readFile(file);
                    // Reset so re-selecting the same file fires `change` again.
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            {fileError ? (
              <p role="alert" className="mt-2 text-[0.68rem] text-status-offline">
                {fileError}
              </p>
            ) : null}

            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: "Rows parsed", value: seeds.length, tone: "text-slate-200" },
                {
                  label: "Ready",
                  value: parsed.valid.length,
                  tone: parsed.valid.length > 0 ? "text-status-healthy" : "text-slate-500",
                },
                {
                  label: "Needs attention",
                  value: problems.length,
                  tone: problems.length > 0 ? "text-status-offline" : "text-slate-500",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2"
                >
                  <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
                  <p className={cn("num mt-1 text-lg font-semibold leading-none", stat.tone)}>{stat.value}</p>
                </div>
              ))}
            </div>

            {problems.length > 0 ? (
              <ul className="mt-3 space-y-1 rounded-xl border border-status-degraded/30 bg-status-degraded/[0.06] px-3 py-2.5">
                {problems.slice(0, 3).map((row) => (
                  <li key={row.line} className="num flex items-start gap-1.5 text-[0.68rem] text-slate-300">
                    <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-status-degraded" />
                    <span>
                      line {row.line}: {ROW_ISSUE_COPY[row.issue ?? "invalid-address"]}
                    </span>
                  </li>
                ))}
                {problems.length > 3 ? (
                  <li className="num text-[0.68rem] text-slate-500">
                    and {problems.length - 3} more - every one of them is still imported, marked in the table.
                  </li>
                ) : null}
              </ul>
            ) : null}

            {tooMany ? (
              <p className="mt-3 rounded-xl border border-status-offline/30 bg-status-offline/[0.07] px-3 py-2.5 text-[0.68rem] leading-relaxed text-slate-300">
                That is <span className="num">{seeds.length}</span> rows - this table edits up to{" "}
                <span className="num">{MAX_IMPORT_ROWS}</span> at a time. Split the list and send it in parts.
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800/80 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-800 px-3.5 py-2 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => commit("replace")}
                disabled={!canImport}
                className={cn(
                  "rounded-xl border px-3.5 py-2 text-xs font-medium transition",
                  canImport
                    ? "border-slate-700 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300"
                    : "cursor-not-allowed border-slate-800 text-slate-600",
                )}
              >
                Replace table
              </button>
              <button
                type="button"
                onClick={() => commit("append")}
                disabled={!canImport}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition duration-200 ease-out-expo",
                  canImport
                    ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300 hover:shadow-glow"
                    : "cursor-not-allowed border border-slate-800 bg-slate-900/60 text-slate-500",
                )}
              >
                Add {seeds.length > 0 ? seeds.length : ""} {seeds.length === 1 ? "row" : "rows"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
