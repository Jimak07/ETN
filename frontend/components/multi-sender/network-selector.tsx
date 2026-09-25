"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { GlassCard, SectionHeading } from "@/components/ui/glass-card";
import { cn } from "@/lib/cn";
import { SUPPORTED_CHAINS, type ChainConfig } from "@/lib/chains";

/**
 * The network the batch is signed on.
 *
 * A dropdown rather than a row of tabs, because the hub supports several EVM
 * chains and the list will only grow: a fixed-size control keeps the layout
 * stable while the list beside it does not.
 *
 * Selecting a network is a wallet action, not a local variable. A batch sender
 * address is only valid on the chain it was deployed to, so the control reports
 * what the wallet currently holds and *asks the wallet to move* - it never
 * pretends that picking an option here changes where a signature lands.
 */

interface NetworkSelectorProps {
  /** Chain the wallet reported, or null before a wallet answers. */
  chainId: number | null;
  /** Descriptor for the active chain, falling back to the default. */
  chain: ChainConfig;
  /** False when the wallet sits on a chain this module cannot act on. */
  chainOk: boolean;
  connected: boolean;
  switching: boolean;
  disabled?: boolean;
  onSelect: (chainId: number) => void;
}

export function NetworkSelector({
  chainId,
  chain,
  chainOk,
  connected,
  switching,
  disabled = false,
  onSelect,
}: NetworkSelectorProps) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  // Pointerdown rather than click: closing on the press that starts an outside
  // interaction means the control is gone before the click lands elsewhere,
  // which is what a menu is expected to do.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const select = useCallback(
    (target: number) => {
      setOpen(false);
      if (target === chainId) return;
      onSelect(target);
    },
    [chainId, onSelect],
  );

  /**
   * Three states, not two. "No wallet connected" is not the same as "wallet
   * parked on a chain this module cannot act on", and only the second is a
   * problem the user has to fix. A disconnected wallet is reported as the chain
   * it would default to, with the missing connection named underneath.
   */
  const disconnected = chainId === null;
  const mismatch = !disconnected && !chainOk;
  const dotTone = disconnected
    ? "bg-slate-600"
    : chainOk
      ? "bg-cyan-400 shadow-glow"
      : "bg-status-degraded";

  return (
    /**
     * `overflow-visible` overrides the glass panel's clipping: the menu is
     * absolutely positioned below the trigger and would otherwise be cut off at
     * the card's edge. `z-30` is the other half of the same problem - the panel's
     * backdrop blur makes it a stacking context, so without a z-index of its own
     * the cards *below* this one would paint straight over the open menu.
     */
    <GlassCard className="z-30 overflow-visible p-5">
      <SectionHeading
        title="Network"
        subtitle="Where the batch is signed - your wallet holds the key"
        icon={<span className={cn("h-2 w-2 rounded-full", dotTone)} />}
      />

      <div ref={container} className="relative mt-4">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          disabled={disabled || switching}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition duration-200 ease-out-expo",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30",
            "disabled:cursor-not-allowed disabled:opacity-60",
            open
              ? "border-cyan-500/50 bg-slate-950/70"
              : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
          )}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", dotTone)} />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-slate-200">
                {mismatch ? "Unsupported network" : chain.name}
              </span>
              <span className="num block truncate text-[0.62rem] text-slate-500">
                {disconnected
                  ? "wallet not connected"
                  : chainOk
                    ? `${chain.label} · chain ${chain.id}`
                    : `chain ${chainId}`}
              </span>
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-2">
            {switching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
            ) : (
              <span className="num text-[0.62rem] text-slate-500">{chain.nativeCurrency.symbol}</span>
            )}
            <ChevronDown
              className={cn("h-4 w-4 text-slate-500 transition-transform duration-200", open && "rotate-180")}
            />
          </span>
        </button>

        <AnimatePresence>
          {open ? (
            <motion.ul
              role="listbox"
              aria-label="Networks"
              initial={reduceMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "absolute inset-x-0 top-[calc(100%+0.4rem)] z-40 space-y-1 rounded-xl border border-slate-800 p-1.5",
                /* Opaque, not translucent: this floats over another card, and a
                   see-through menu makes both layers hard to read. */
                "bg-slate-950 shadow-card",
              )}
            >
              {SUPPORTED_CHAINS.map((option) => {
                const active = option.id === chainId;

                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => select(option.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left transition",
                        active ? "bg-cyan-500/10" : "hover:bg-slate-800/60",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-xs font-medium text-slate-200">
                          {option.name}
                          {option.testnet ? (
                            <span className="rounded-full border border-status-degraded/40 px-1.5 py-0.5 text-[0.55rem] uppercase tracking-[0.12em] text-status-degraded">
                              Testnet
                            </span>
                          ) : null}
                        </span>
                        <span className="num mt-0.5 block truncate text-[0.62rem] text-slate-500">
                          {option.nativeCurrency.symbol} · chain {option.id}
                        </span>
                      </span>

                      {active ? <Check className="h-3.5 w-3.5 shrink-0 text-cyan-300" /> : null}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          ) : null}
        </AnimatePresence>
      </div>

      <p className="mt-3 text-[0.68rem] leading-relaxed text-slate-500">
        {connected
          ? "Switching asks your wallet to change network - nothing is signed until you send."
          : "Connect a wallet to switch networks."}
      </p>
    </GlassCard>
  );
}
