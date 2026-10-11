"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ClipboardList,
  FlaskConical,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { RecipientSeed } from "@/hooks/use-recipient-rows";
import { parseRawPastedLines } from "@/lib/multi-sender/parse";

const SAMPLE_PASTE = [
  "0xA0f8ee187330ea22271714B815de18Cd74eBdc08: 12.5",
  "0xD2aA558720EdeFbef16435Ed771Ee94E8f62C12E 48",
  "0x47A35A262186C0D76Ba5ca01a6262F120a25AD2B, 7.25",
  "0x2d1d8168357EBf09aC6CD2B5911575A732F4dc43\t150",
].join("\n");

interface QuickPasteModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (rows: readonly RecipientSeed[], mode: "append" | "replace") => void;
  currentRowsCount: number;
}

export function QuickPasteModal({
  open,
  onClose,
  onImport,
  currentRowsCount,
}: QuickPasteModalProps) {
  const [text, setText] = useState("");
  const reduceMotion = useReducedMotion();

  const parsedSeeds = useMemo(() => {
    if (!text.trim()) return [];
    return parseRawPastedLines(text);
  }, [text]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const handleCommit = (mode: "append" | "replace") => {
    if (parsedSeeds.length === 0) return;
    onImport(parsedSeeds, mode);
    setText("");
    onClose();
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="quick-paste-modal"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label="Paste Raw Text"
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
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/80 text-cyan-400">
                  <ClipboardList className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-slate-100">
                    Paste Raw Text / Discord / Sheets
                  </h2>
                  <p className="text-xs text-slate-400">
                    Paste text in any format: <code className="font-mono text-cyan-300">0xaddr, amount</code>,{" "}
                    <code className="font-mono text-cyan-300">0xaddr:amount</code>, tab-separated, or space-separated.
                  </p>
                </div>
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

            <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/60 p-1 focus-within:border-cyan-500/60 focus-within:ring-2 focus-within:ring-cyan-500/20">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                placeholder={
                  "0x1234567890123456789012345678901234567890, 10.5\n0xabcdefabcdefabcdefabcdefabcdefabcdefabcd: 5\n0x9876543210987654321098765432109876543210 25.0"
                }
                className="font-mono h-44 w-full resize-y bg-transparent p-3 text-xs leading-relaxed text-slate-200 placeholder:text-slate-600 focus:outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 px-3 py-2 bg-slate-950/40">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setText(SAMPLE_PASTE)}
                  >
                    <FlaskConical className="h-3 w-3 text-cyan-300" />
                    Load Sample
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setText("")}
                    disabled={!text}
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear
                  </Button>
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  {parsedSeeds.length > 0 ? (
                    <span className="flex items-center gap-1 font-mono text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {parsedSeeds.length} line(s) parsed
                    </span>
                  ) : text.trim() ? (
                    <span className="flex items-center gap-1 font-mono text-amber-400">
                      <AlertCircle className="h-3.5 w-3.5" />
                      0 lines recognized
                    </span>
                  ) : (
                    <span className="font-mono text-slate-500">Waiting for text...</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-800/80 pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleCommit("replace")}
                disabled={parsedSeeds.length === 0}
              >
                Replace Entire Table
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={() => handleCommit("append")}
                disabled={parsedSeeds.length === 0}
              >
                Append {parsedSeeds.length > 0 ? `(${parsedSeeds.length})` : ""} to List
              </Button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
