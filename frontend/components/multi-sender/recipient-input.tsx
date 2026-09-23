"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ClipboardPaste, FileSpreadsheet, FlaskConical, Trash2, UploadCloud } from "lucide-react";
import { useCallback, useRef, useState, type DragEvent } from "react";

import { GlassCard, SectionHeading } from "@/components/ui/glass-card";
import { cn } from "@/lib/cn";

type InputTab = "paste" | "upload";

/** Big enough for a 100k-row export, small enough not to wedge the tab. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

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

interface RecipientInputProps {
  value: string;
  onChange: (value: string) => void;
  onFile: (fileName: string, text: string) => void;
  fileName: string | null;
  parsedRows: number;
  disabled?: boolean;
}

export function RecipientInput({
  value,
  onChange,
  onFile,
  fileName,
  parsedRows,
  disabled = false,
}: RecipientInputProps) {
  const [tab, setTab] = useState<InputTab>("paste");
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const readFile = useCallback(
    async (file: File) => {
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
        const text = await file.text();
        if (text.trim().length === 0) {
          setFileError("That file is empty.");
          return;
        }
        onFile(file.name, text);
      } catch {
        setFileError("Could not read that file. Try pasting the rows instead.");
      }
    },
    [onFile],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (disabled) return;

      const file = event.dataTransfer.files?.[0];
      if (file) void readFile(file);
    },
    [disabled, readFile],
  );

  const onDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (disabled) return;
      setDragging(true);
    },
    [disabled],
  );

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepth.current += 1;
      if (disabled) return;
      setDragging(true);
    },
    [disabled],
  );

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    // Depth counting: dragging over a child fires `leave` on the parent, and a
    // naive boolean would make the highlight flicker on every internal move.
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const lineCount = value.trim().length === 0 ? 0 : value.trim().split(/\r?\n/).length;

  return (
    <GlassCard className="p-5">
      <SectionHeading
        title="Recipients"
        subtitle="Paste a list or drop a CSV of address, amount - one per line"
        icon={<ClipboardPaste className="h-4 w-4" />}
        action={
          <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-950/60 p-1">
            {(["paste", "upload"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTab(option)}
                className={cn(
                  "relative rounded-full px-3 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] transition",
                  tab === option ? "text-slate-950" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {tab === option ? (
                  <motion.span
                    layoutId="recipient-input-tab"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-full bg-cyan-400"
                  />
                ) : null}
                <span className="relative">{option === "paste" ? "Paste" : "Upload"}</span>
              </button>
            ))}
          </div>
        }
      />

      <div className="mt-4">
        <AnimatePresence mode="wait" initial={false}>
          {tab === "paste" ? (
            <motion.div
              key="paste"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                spellCheck={false}
                rows={12}
                placeholder={"0x7A9c1d1Bb2b1aF7f0b7c9d5f2f9aB1C3d4E5f607,12.5\n0x1B2c3D4e5F60718293a4B5c6D7e8F901234567890,48"}
                className={cn(
                  "num w-full resize-y rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs leading-relaxed text-slate-200",
                  "placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              />
            </motion.div>
          ) : (
            <motion.div
              key="upload"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onClick={() => fileInput.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") fileInput.current?.click();
                }}
                className={cn(
                  "flex h-[16.5rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 text-center transition duration-300 ease-out-expo",
                  dragging
                    ? "border-cyan-400/70 bg-cyan-500/[0.08] shadow-glow"
                    : "border-slate-700/80 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-900/40",
                  disabled && "pointer-events-none opacity-60",
                )}
              >
                <motion.span
                  animate={dragging && !reduceMotion ? { scale: 1.08, y: -2 } : { scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ring-inset transition",
                    dragging
                      ? "bg-cyan-500/20 text-cyan-200 ring-cyan-400/40"
                      : "bg-slate-800/60 text-slate-400 ring-slate-700/60",
                  )}
                >
                  <UploadCloud className="h-5 w-5" />
                </motion.span>

                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-200">
                    {dragging ? "Drop to load the list" : "Drag a CSV here, or click to browse"}
                  </p>
                  <p className="text-xs text-slate-500">address, amount - separated by a comma, semicolon or tab</p>
                </div>

                {fileName ? (
                  <span className="num inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[0.68rem] text-slate-300">
                    <FileSpreadsheet className="h-3 w-3 text-cyan-300" />
                    {fileName}
                    <span className="text-slate-500">{lineCount} lines</span>
                  </span>
                ) : null}
              </div>

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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {fileError ? (
        <p role="alert" className="mt-2 text-xs text-status-offline">
          {fileError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="num text-[0.7rem] text-slate-500">
          {parsedRows === 0 ? "No rows yet" : `${parsedRows} row${parsedRows === 1 ? "" : "s"} parsed`}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(SAMPLE)}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[0.68rem] font-medium text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300 disabled:opacity-50"
          >
            <FlaskConical className="h-3 w-3" />
            Load sample
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={disabled || value.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[0.68rem] font-medium text-slate-400 transition hover:border-status-offline/40 hover:text-status-offline disabled:opacity-40"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>
    </GlassCard>
  );
}
