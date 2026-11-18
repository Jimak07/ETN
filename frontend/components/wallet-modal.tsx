"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink, Loader2, ShieldCheck, Wallet, X } from "lucide-react";

import { cn } from "@/lib/cn";
import {
  SUPPORTED_WALLET_CATALOG,
  useWalletContext,
  type EIP6963ProviderDetail,
} from "@/lib/wallet";

export function WalletModal() {
  const { isModalOpen, closeModal, detectedWallets, connect, connecting } =
    useWalletContext();
  const [connectingRdns, setConnectingRdns] = useState<string | null>(null);

  // Close on Escape key press
  useEffect(() => {
    if (!isModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isModalOpen, closeModal]);

  if (!isModalOpen) return null;

  const handleConnect = async (w: EIP6963ProviderDetail) => {
    setConnectingRdns(w.info.rdns);
    try {
      await connect(w);
    } finally {
      setConnectingRdns(null);
    }
  };

  // Missing catalog items not in detected list
  const missingCatalogWallets = SUPPORTED_WALLET_CATALOG.filter(
    (catalogItem) =>
      !detectedWallets.some(
        (detected) =>
          detected.info.rdns.toLowerCase() === catalogItem.rdns.toLowerCase() ||
          detected.info.name.toLowerCase().includes(catalogItem.name.toLowerCase())
      )
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-modal-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={closeModal}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/95 p-5 sm:p-6 shadow-2xl backdrop-blur-xl transition-all animate-in zoom-in-95 duration-200 z-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="wallet-modal-title"
                className="text-base sm:text-lg font-bold text-slate-100 tracking-tight"
              >
                Connect a Wallet
              </h2>
              <p className="text-xs text-slate-400">
                Electroneum Smart Chain (Chain 52014)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="mt-4 space-y-5 max-h-[68vh] overflow-y-auto pr-1">
          {/* Section A: Detected Wallets */}
          <div>
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Detected on this browser
              </span>
              <span className="text-[0.65rem] font-mono text-cyan-400/90 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                {detectedWallets.length} ready
              </span>
            </div>

            {detectedWallets.length > 0 ? (
              <div className="space-y-2">
                {detectedWallets.map((w) => {
                  const isThisConnecting = connecting && connectingRdns === w.info.rdns;
                  return (
                    <button
                      key={w.info.rdns || w.info.uuid}
                      type="button"
                      disabled={connecting}
                      onClick={() => handleConnect(w)}
                      className={cn(
                        "group w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left",
                        "border-slate-800/80 bg-slate-950/60 hover:bg-cyan-950/30 hover:border-cyan-500/40",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
                        isThisConnecting && "border-cyan-500 bg-cyan-950/40"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg overflow-hidden border border-slate-700/60 bg-slate-900 shrink-0 flex items-center justify-center p-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={w.info.icon}
                            alt={w.info.name}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-100 group-hover:text-cyan-200 transition">
                            {w.info.name}
                          </div>
                          <div className="text-[0.68rem] text-slate-400 font-mono">
                            {w.info.rdns || "EIP-6963 Injected"}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isThisConnecting ? (
                          <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-medium">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Connecting...</span>
                          </div>
                        ) : (
                          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Detected
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-4 text-center">
                <p className="text-xs text-slate-400">
                  No browser wallet extensions detected yet.
                </p>
                <p className="text-[0.68rem] text-slate-500 mt-1">
                  Install one of the supported wallets below to connect.
                </p>
              </div>
            )}
          </div>

          {/* Section B: Missing Supported Wallets (Install Catalog) */}
          {missingCatalogWallets.length > 0 && (
            <div>
              <div className="pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Available to Install
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {missingCatalogWallets.map((item) => (
                  <a
                    key={item.id}
                    href={item.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center justify-between p-2.5 rounded-xl border border-slate-800/60 bg-slate-950/30 hover:border-slate-700 hover:bg-slate-900/60 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="h-7 w-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center p-0.5 border border-slate-800"
                        dangerouslySetInnerHTML={{ __html: item.iconSvg }}
                      />
                      <div className="truncate text-xs font-medium text-slate-300 group-hover:text-slate-100">
                        {item.name}
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-[0.68rem] text-cyan-400 group-hover:text-cyan-300 font-medium shrink-0 ml-2">
                      <span>Install</span>
                      <ExternalLink className="h-2.5 w-2.5" />
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex items-center justify-between text-[0.68rem] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-400/80" />
            <span>Non-custodial & secure via EIP-6963</span>
          </div>
          <span className="font-mono">Chain ID: 52014</span>
        </div>
      </div>
    </div>
  );
}
