"use client";

import { Check, Loader2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { METAMASK_DOWNLOAD_URL, addEtnToWallet, getEthereumProvider } from "@/lib/wallet";

type ButtonPhase = "idle" | "pending" | "success" | "error";

interface ButtonState {
  phase: ButtonPhase;
  message?: string;
}

/**
 * EIP-3085 button: asks the injected wallet to add + select ETN-SC. Falls back
 * to the MetaMask download page when no provider is present.
 */
export function AddEtnButton() {
  const [state, setState] = useState<ButtonState>({ phase: "idle" });
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);

  useEffect(() => {
    setHasProvider(getEthereumProvider() !== null);
  }, []);

  async function handleClick() {
    if (state.phase === "pending") return;

    if (hasProvider === false) {
      window.open(METAMASK_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
      setState({
        phase: "error",
        message: "No EVM wallet detected — opened the MetaMask install page.",
      });
      return;
    }

    setState({ phase: "pending" });
    const result = await addEtnToWallet();
    setState({ phase: result.ok ? "success" : "error", message: result.message });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={state.phase === "pending"}
        className={cn(
          "group inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition duration-200 ease-out-expo",
          "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/20 hover:shadow-glow",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          "disabled:cursor-wait disabled:opacity-70",
          state.phase === "success" && "border-status-healthy/40 bg-status-healthy/10 text-status-healthy",
        )}
      >
        {state.phase === "pending" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state.phase === "success" ? (
          <Check className="h-4 w-4" />
        ) : (
          <Wallet className="h-4 w-4" />
        )}
        {state.phase === "pending" ? "Adding network…" : "Add ETN to Wallet"}
      </button>

      {state.message ? (
        <p
          aria-live="polite"
          className={cn(
            "max-w-xs text-xs leading-relaxed",
            state.phase === "error" ? "text-status-degraded" : "text-status-healthy",
          )}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
