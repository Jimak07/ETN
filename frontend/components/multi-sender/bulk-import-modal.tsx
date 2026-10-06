"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  FileSpreadsheet,
  FlaskConical,
  Trash2,
  TriangleAlert,
  UploadCloud,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RecipientSeed } from "@/hooks/use-recipient-rows";
import { cn } from "@/lib/cn";
import { parseRecipientCsv } from "@/lib/multi-sender/csv";
import { BATCH_CAP_NOTICE, MAX_RECIPIENT_ROWS } from "@/lib/multi-sender/parse";

export type ImportMode = "append" | "replace";

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

const SAMPLE_CSV = [
  "address,amount",
  "0xA0f8ee187330ea22271714B815de18Cd74eBdc08,12.5",
  "0xD2aA558720EdeFbef16435Ed771Ee94E8f62C12E,48",
  "0x47A35A262186C0D76Ba5ca01a6262F120a25AD2B,7.25",
  "0x2d1d8168357EBf09aC6CD2B5911575A732F4dc43,150",
  // Example of a typo address to demonstrate inline error flagging:
  "0xBadAddressTypo1234567890abcdef,5",
].join("\n");

interface BulkImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: readonly RecipientSeed[], mode: ImportMode) => void;
  decimals: number;
  selfAddress: string | null;
  currentRows: number;
  disabled?: boolean;
}

export function BulkImportModal({
  open,
  onClose,
  currentRows,
  onImport,
  disabled = false,
}: BulkImportModalProps) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  // Smart CSV parser using PapaParse & viem isAddress
  const csvResult = useMemo(() => {
    if (!text.trim()) {
      return { rows: [], totalRows: 0, validAddressCount: 0, invalidAddressCount: 0 };
    }
    return parseRecipientCsv(text);
  }, [text]);

  const seeds: RecipientSeed[] = useMemo(
    () => csvResult.rows.map((row) => ({ address: row.rawAddress, amount: row.rawAmount })),
    [csvResult.rows]
  );

  const overCap = seeds.length > MAX_RECIPIENT_ROWS;
  const appendOverflow = currentRows + seeds.length > MAX_RECIPIENT_ROWS;
  const canReplace = !disabled && !overCap && seeds.length > 0;
  const canAppend = canReplace && !appendOverflow;

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
      setFileError(`File is ${(file.size / 1024 / 1024).toFixed(1)}MB (max 2MB limit).`);
      return;
    }
    if (file.type && !/^(text\/|application\/(csv|vnd\.ms-excel))/.test(file.type)) {
      setFileError("Please upload a .csv or .txt file.");
      return;
    }

    try {
      const contents = await file.text();
      if (contents.trim().length === 0) {
        setFileError("Uploaded file is empty.");
        return;
      }
      setText(contents);
      setFileName(file.name);
    } catch {
      setFileError("Could not read file. Try pasting the CSV content directly.");
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
    [readFile]
  );

  const commit = useCallback(
    (mode: ImportMode) => {
      if (mode === "append" ? !canAppend : !canReplace) return;
      onImport(seeds, mode);
      setText("");
      setFileName(null);
    },
    [canAppend, canReplace, onImport, seeds]
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
          aria-label="Bulk Import CSV"
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-md sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 340, damping: 30 }}
            className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-xl"
          >
            {/* Cyan hairline accent */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent"
            />

            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight text-slate-100">
                  Bulk CSV Importer
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Upload or paste a CSV list with{" "}
                  <code className="font-mono text-cyan-300">address, amount</code> or Token IDs.
                  Addresses are strictly validated, and malformed rows will be flagged for inline correction.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg border border-slate-800 p-1.5 text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
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
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragging(false);
              }}
              className={cn(
                "mt-4 rounded-xl border border-dashed transition duration-200",
                dragging
                  ? "border-cyan-400 bg-cyan-500/10 shadow-glow"
                  : "border-slate-700/80 bg-slate-950/60"
              )}
            >
              <textarea
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  setFileName(null);
                }}
                spellCheck={false}
                placeholder={"address,amount\n0x1234..., 12.5\n0xabcd..., 3"}
                aria-label="Recipients CSV text"
                className={cn(
                  "font-mono h-36 w-full resize-y bg-transparent p-3 text-xs leading-relaxed text-slate-200",
                  "placeholder:text-slate-600 focus:outline-none"
                )}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 px-3 py-2">
                <span className="font-mono text-[0.68rem] text-slate-400">
                  {fileName ? (
                    <span className="inline-flex items-center gap-1.5 text-cyan-300">
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {fileName}
                    </span>
                  ) : (
                    "Drag & drop .csv file, or paste text above"
                  )}
                </span>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setText(SAMPLE_CSV)}
                  >
                    <FlaskConical className="h-3 w-3 text-cyan-300" />
                    Load Sample
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setText("");
                      setFileName(null);
                      setFileError(null);
                    }}
                    disabled={text.length === 0 && fileName === null}
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInput.current?.click()}
                  >
                    <UploadCloud className="h-3.5 w-3.5 text-cyan-400" />
                    Choose File
                  </Button>
                </div>

                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void readFile(file);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            {fileError ? (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Upload Error</AlertTitle>
                <AlertDescription>{fileError}</AlertDescription>
              </Alert>
            ) : null}

            {/* Smart validation stats */}
            {seeds.length > 0 ? (
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
                  <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-slate-400">
                    Total Rows
                  </p>
                  <p className="font-mono mt-1 text-lg font-bold text-slate-100">
                    {csvResult.totalRows}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-2.5">
                  <p className="flex items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-wider text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Valid Addresses
                  </p>
                  <p className="font-mono mt-1 text-lg font-bold text-emerald-300">
                    {csvResult.validAddressCount}
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-xl border p-2.5",
                    csvResult.invalidAddressCount > 0
                      ? "border-rose-500/40 bg-rose-950/20"
                      : "border-slate-800 bg-slate-950/60"
                  )}
                >
                  <p
                    className={cn(
                      "flex items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-wider",
                      csvResult.invalidAddressCount > 0 ? "text-rose-400" : "text-slate-500"
                    )}
                  >
                    <AlertCircle className="h-3 w-3" /> Flagged Malformed
                  </p>
                  <p
                    className={cn(
                      "font-mono mt-1 text-lg font-bold",
                      csvResult.invalidAddressCount > 0 ? "text-rose-300" : "text-slate-500"
                    )}
                  >
                    {csvResult.invalidAddressCount}
                  </p>
                </div>
              </div>
            ) : null}

            {csvResult.invalidAddressCount > 0 ? (
              <Alert variant="destructive" className="mt-3">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Malformed Addresses Flagged</AlertTitle>
                <AlertDescription>
                  {csvResult.invalidAddressCount} row(s) contain invalid or mistyped addresses. They
                  will be imported with red highlights so you can easily correct them inline in the
                  table.
                </AlertDescription>
              </Alert>
            ) : null}

            {overCap ? (
              <Alert variant="destructive" className="mt-3">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Batch Cap Exceeded</AlertTitle>
                <AlertDescription>
                  You are attempting to import {seeds.length} rows, but each batch run is capped at{" "}
                  {MAX_RECIPIENT_ROWS} addresses to respect network gas limits.
                </AlertDescription>
              </Alert>
            ) : null}

            {!overCap && appendOverflow ? (
              <Alert variant="warning" className="mt-3">
                <TriangleAlert className="h-4 w-4" />
                <AlertTitle>Append Cap Warning</AlertTitle>
                <AlertDescription>
                  Table already holds {currentRows} of {MAX_RECIPIENT_ROWS} recipients. Appending{" "}
                  {seeds.length} rows would exceed the cap. Use &quot;Replace Table&quot; instead.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800/80 pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => commit("replace")}
                disabled={!canReplace}
              >
                Replace Table
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={() => commit("append")}
                disabled={!canAppend}
              >
                Add {seeds.length > 0 ? seeds.length : ""} {seeds.length === 1 ? "Row" : "Rows"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
