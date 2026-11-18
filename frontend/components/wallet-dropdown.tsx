"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  RotateCw,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/cn";
import { ETN_EXPLORER_URL } from "@/lib/etn";
import { useWalletContext } from "@/lib/wallet";

export function WalletDropdown() {
  const {
    account,
    chainId,
    isChainOk,
    activeWallet,
    balance,
    openModal,
    disconnect,
    switchToElectroneum,
    switchAccount,
    refreshBalance,
    switching,
  } = useWalletContext();

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const copyAddress = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleRefreshBalance = async () => {
    setRefreshing(true);
    try {
      await refreshBalance();
    } finally {
      setTimeout(() => setRefreshing(false), 400);
    }
  };

  // Disconnected State: Return Connect Wallet Button
  if (!account) {
    return (
      <button
        type="button"
        onClick={openModal}
        className="group relative inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-950/70 via-slate-900/80 to-slate-950/90 px-3 py-1.5 text-xs font-semibold text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.18)] transition-all hover:border-cyan-400 hover:text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
      >
        <Wallet className="h-3.5 w-3.5 text-cyan-400 transition group-hover:scale-110" />
        <span>Connect Wallet</span>
      </button>
    );
  }

  // Truncated address formatting
  const truncatedAddress = `${account.slice(0, 6)}...${account.slice(-4)}`;

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Connected Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={cn(
          "group flex items-center gap-2 rounded-xl border px-2.5 py-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
          isOpen
            ? "border-cyan-500/60 bg-cyan-950/40 text-slate-100 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
            : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700 hover:bg-slate-900/90 hover:text-white"
        )}
      >
        {/* Active Provider Icon */}
        <div className="flex h-5 w-5 items-center justify-center rounded-md overflow-hidden bg-slate-950/60 shrink-0 border border-slate-700/50">
          {activeWallet?.info?.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={activeWallet.info.icon}
              alt={activeWallet.info.name}
              className="h-full w-full object-contain p-0.5"
            />
          ) : (
            <Wallet className="h-3 w-3 text-cyan-400" />
          )}
        </div>

        {/* Balance Preview */}
        {balance && (
          <span className="hidden sm:inline-block font-mono font-medium text-cyan-300 text-[0.7rem] bg-cyan-950/50 border border-cyan-500/20 px-2 py-0.5 rounded-md">
            {balance}
          </span>
        )}

        {/* Truncated Address */}
        <span className="font-mono text-slate-300 group-hover:text-slate-100">
          {truncatedAddress}
        </span>

        {/* Network Status Dot */}
        <span
          className={cn(
            "h-2 w-2 rounded-full shrink-0",
            isChainOk
              ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
              : "bg-amber-400 animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.7)]"
          )}
          title={isChainOk ? "Electroneum Mainnet (52014)" : `Wrong Chain (${chainId ?? "Unknown"})`}
        />

        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-400 transition-transform duration-200",
            isOpen && "rotate-180 text-cyan-400"
          )}
        />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl border border-slate-800 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95 duration-150">
          {/* Header: Provider & Account */}
          <div className="pb-3 border-b border-slate-800/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeWallet?.info?.icon && (
                  <div className="h-6 w-6 rounded-md overflow-hidden bg-slate-950 border border-slate-700/60 p-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={activeWallet.info.icon}
                      alt={activeWallet.info.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                )}
                <span className="text-xs font-semibold text-slate-200">
                  {activeWallet?.info?.name ?? "Connected Wallet"}
                </span>
              </div>
              <span className="text-[0.62rem] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded-full">
                Connected
              </span>
            </div>

            {/* Full Address Row */}
            <div className="mt-2.5 flex items-center justify-between rounded-xl bg-slate-950/80 border border-slate-800 p-2">
              <span className="font-mono text-xs text-slate-300 truncate max-w-[190px]">
                {account}
              </span>
              <div className="flex items-center gap-1 shrink-0 ml-1">
                <button
                  type="button"
                  onClick={copyAddress}
                  title="Copy address"
                  className="rounded-lg p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                <a
                  href={`${ETN_EXPLORER_URL}/address/${account}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View on Blockscout Explorer"
                  className="rounded-lg p-1 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>

          {/* Network Status / Switch Warning */}
          <div className="py-2.5 border-b border-slate-800/80">
            {isChainOk ? (
              <div className="flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                  <span className="font-medium">Electroneum Mainnet</span>
                </div>
                <span className="font-mono text-[0.68rem] text-slate-500">52014</span>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>Wrong Network (Chain {chainId ?? "Unknown"})</span>
                </div>
                <p className="text-[0.68rem] text-amber-200/80">
                  ETNVerse Hub operates strictly on Electroneum Smart Chain.
                </p>
                <button
                  type="button"
                  disabled={switching}
                  onClick={() => switchToElectroneum()}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-500/30 transition"
                >
                  {switching ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Switching Network...</span>
                    </>
                  ) : (
                    <span>Switch to Electroneum</span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Balance Section */}
          <div className="py-2.5 border-b border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-[0.68rem] text-slate-400 uppercase tracking-wider">
                ETN Balance
              </div>
              <div className="font-mono text-sm font-bold text-cyan-300">
                {balance ?? "Loading..."}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefreshBalance}
              disabled={refreshing}
              title="Refresh Balance"
              className="rounded-lg p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 transition"
            >
              <RotateCw
                className={cn("h-3.5 w-3.5", refreshing && "animate-spin text-cyan-400")}
              />
            </button>
          </div>

          {/* Actions: Switch Wallet & Disconnect */}
          <div className="pt-2.5 space-y-1.5">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                openModal();
              }}
              className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800/80 hover:text-slate-100 transition"
            >
              <ArrowRightLeft className="h-3.5 w-3.5 text-cyan-400" />
              <span>Switch Wallet / Change Account</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                disconnect();
              }}
              className="w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 border border-transparent hover:border-rose-500/30 transition"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Disconnect Wallet</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
