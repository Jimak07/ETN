"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowDownUp,
  ArrowRight,
  ChevronDown,
  Coins,
  Fuel,
  Info,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatUnits } from "viem";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { TokenInfo } from "@/lib/constants/electroswap";
import { useSwap } from "@/hooks/use-swap";
import { SlippagePopover } from "./slippage-popover";
import { SwapTxModal } from "./swap-tx-modal";
import { TokenSelectorModal } from "./token-selector-modal";

export function SwapCard() {
  const reduceMotion = useReducedMotion();

  const {
    account,
    chainId,
    chainOk,
    connecting,
    switching,
    walletError,
    connect,
    switchToElectroneum,

    tokens,
    payToken,
    setPayToken,
    receiveToken,
    setReceiveToken,
    switchTokens,
    importCustomToken,

    payBalance,
    receiveBalance,

    payAmount,
    setPayAmount,
    payAmountWei,
    receiveAmount,
    quote,
    quoting,

    slippage,
    setSlippage,
    deadlineMinutes,
    setDeadlineMinutes,

    needsApproval,
    approving,
    approve,

    swap,
    swapPhase,
    txHash,
    txError,
    resetTx,
  } = useSwap();

  // Modals state
  const [selectorTarget, setSelectorTarget] = useState<"pay" | "receive" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rateInverted, setRateInverted] = useState(false);

  // Formatted balances for display
  const formattedPayBalance = useMemo(() => {
    if (payBalance === null) return null;
    return Number(formatUnits(payBalance, payToken.decimals)).toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
  }, [payBalance, payToken.decimals]);

  const formattedReceiveBalance = useMemo(() => {
    if (receiveBalance === null) return null;
    return Number(formatUnits(receiveBalance, receiveToken.decimals)).toLocaleString(undefined, {
      maximumFractionDigits: 4,
    });
  }, [receiveBalance, receiveToken.decimals]);

  // Handle Max Button
  const handleMaxClick = () => {
    if (payBalance === null || payBalance <= 0n) return;
    if (payToken.isNative) {
      // Reserve 0.05 ETN for gas buffer
      const gasBuffer = 50000000000000000n; // 0.05 ETN
      const spendable = payBalance > gasBuffer ? payBalance - gasBuffer : 0n;
      setPayAmount(formatUnits(spendable, payToken.decimals));
    } else {
      setPayAmount(formatUnits(payBalance, payToken.decimals));
    }
  };

  // Check if balance is exceeded
  const isBalanceExceeded = useMemo(() => {
    if (payBalance === null || payAmountWei <= 0n) return false;
    return payAmountWei > payBalance;
  }, [payBalance, payAmountWei]);

  // Derived button state
  const buttonState = useMemo(() => {
    if (!account) {
      return {
        label: connecting ? "Connecting Wallet..." : "Connect Wallet",
        action: connect,
        disabled: connecting,
        variant: "primary" as const,
      };
    }

    if (!chainOk) {
      return {
        label: switching ? "Switching to Electroneum..." : "Switch to Electroneum",
        action: switchToElectroneum,
        disabled: switching,
        variant: "primary" as const,
      };
    }

    if (payToken.address.toLowerCase() === receiveToken.address.toLowerCase()) {
      return {
        label: "Select Different Tokens",
        action: () => {},
        disabled: true,
        variant: "disabled" as const,
      };
    }

    if (!payAmount.trim() || Number(payAmount) <= 0) {
      return {
        label: "Enter an Amount",
        action: () => {},
        disabled: true,
        variant: "disabled" as const,
      };
    }

    if (isBalanceExceeded) {
      return {
        label: `Insufficient ${payToken.symbol} Balance`,
        action: () => {},
        disabled: true,
        variant: "disabled" as const,
      };
    }

    if (quoting) {
      return {
        label: "Fetching Best Price...",
        action: () => {},
        disabled: true,
        variant: "disabled" as const,
      };
    }

    if (quote && !quote.hasLiquidity) {
      return {
        label: "Insufficient Liquidity for this Trade",
        action: () => {},
        disabled: true,
        variant: "disabled" as const,
      };
    }

    if (needsApproval) {
      return {
        label: approving ? `Approving ${payToken.symbol}...` : `Approve ${payToken.symbol}`,
        action: approve,
        disabled: approving,
        variant: "approve" as const,
      };
    }

    const isSwapping = swapPhase === "signing" || swapPhase === "broadcasting";
    return {
      label: isSwapping ? "Swapping..." : quote?.route.isWrap ? "Wrap ETN" : quote?.route.isUnwrap ? "Unwrap WETN" : "Swap",
      action: swap,
      disabled: isSwapping || !quote || quote.amountOutWei <= 0n,
      variant: "primary" as const,
    };
  }, [
    account,
    connecting,
    connect,
    chainOk,
    switching,
    switchToElectroneum,
    payToken,
    receiveToken,
    payAmount,
    isBalanceExceeded,
    quoting,
    quote,
    needsApproval,
    approving,
    approve,
    swapPhase,
    swap,
  ]);

  // Display rate string
  const displayRate = useMemo(() => {
    if (!quote || quote.executionRate <= 0) return null;
    if (rateInverted) {
      return `1 ${receiveToken.symbol} ≈ ${quote.invertedRate.toFixed(4)} ${payToken.symbol}`;
    }
    return `1 ${payToken.symbol} ≈ ${quote.executionRate.toFixed(4)} ${receiveToken.symbol}`;
  }, [quote, rateInverted, payToken.symbol, receiveToken.symbol]);

  // Map user balances for the selector modal
  const balancesMap = useMemo(() => {
    const map: Record<string, bigint | null> = {};
    map[payToken.address.toLowerCase()] = payBalance;
    map[receiveToken.address.toLowerCase()] = receiveBalance;
    return map;
  }, [payToken.address, receiveToken.address, payBalance, receiveBalance]);

  return (
    <div className="relative mx-auto w-full max-w-lg">
      {/* Background card container */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6 shadow-2xl backdrop-blur-xl">
        {/* Subtle top cyan highlight line */}
        <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none" />

        {/* Card Header */}
        <div className="flex items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-100">Swap</h2>
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-wider text-cyan-300">
              ElectroSwap V2
            </span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-label="Slippage settings"
              className={cn(
                "rounded-xl border p-2 transition",
                settingsOpen
                  ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-300"
                  : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
              )}
            >
              <Settings2 className="h-4 w-4" />
            </button>

            <SlippagePopover
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              slippage={slippage}
              onSlippageChange={setSlippage}
              deadlineMinutes={deadlineMinutes}
              onDeadlineChange={setDeadlineMinutes}
            />
          </div>
        </div>

        {/* SWAP FORM */}
        <div className="space-y-2">
          {/* 1. YOU PAY ROW */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 transition focus-within:border-cyan-500/40">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>You Pay</span>
              <div className="flex items-center gap-1.5">
                {formattedPayBalance !== null ? (
                  <span>
                    Balance:{" "}
                    <span className="font-mono text-slate-300 font-medium">
                      {formattedPayBalance}
                    </span>
                  </span>
                ) : null}
                {account && formattedPayBalance !== null ? (
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    className="rounded bg-cyan-950/80 px-1.5 py-0.5 text-[0.65rem] font-semibold text-cyan-400 hover:bg-cyan-900 transition border border-cyan-500/30"
                  >
                    MAX
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Input
                type="number"
                placeholder="0.0"
                step="any"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="border-0 bg-transparent p-0 text-2xl font-bold font-mono tracking-tight text-slate-100 placeholder:text-slate-600 focus-visible:ring-0 focus-visible:ring-offset-0"
              />

              <button
                type="button"
                onClick={() => setSelectorTarget("pay")}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-100 shadow-sm transition hover:border-cyan-500/40 hover:bg-slate-850"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[0.62rem] font-bold text-cyan-300">
                  {payToken.symbol.slice(0, 3)}
                </div>
                <span>{payToken.symbol}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* 2. FLIP DIRECTION BUTTON */}
          <div className="relative flex justify-center -my-2.5 z-10">
            <button
              type="button"
              onClick={switchTokens}
              aria-label="Switch token directions"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 shadow-md transition hover:border-cyan-500/50 hover:bg-slate-800 hover:text-cyan-300 active:scale-95"
            >
              <ArrowDownUp className="h-4 w-4" />
            </button>
          </div>

          {/* 3. YOU RECEIVE ROW */}
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 transition focus-within:border-cyan-500/40">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>You Receive</span>
              {formattedReceiveBalance !== null ? (
                <span>
                  Balance:{" "}
                  <span className="font-mono text-slate-300 font-medium">
                    {formattedReceiveBalance}
                  </span>
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  readOnly
                  placeholder="0.0"
                  value={receiveAmount}
                  className="w-full border-0 bg-transparent p-0 text-2xl font-bold font-mono tracking-tight text-slate-100 placeholder:text-slate-600 focus:outline-none"
                />
                {quoting ? (
                  <div className="absolute left-0 top-0 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                    <span>Calculating output...</span>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setSelectorTarget("receive")}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-100 shadow-sm transition hover:border-cyan-500/40 hover:bg-slate-850"
              >
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[0.62rem] font-bold text-cyan-300">
                  {receiveToken.symbol.slice(0, 3)}
                </div>
                <span>{receiveToken.symbol}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
            </div>
          </div>
        </div>

        {/* 4. SWAP DETAILS ACCORDION */}
        {quote && quote.amountOutWei > 0n ? (
          <div className="mt-4 rounded-xl border border-slate-800/80 bg-slate-950/40 p-3.5 space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>Exchange Rate</span>
              <button
                type="button"
                onClick={() => setRateInverted((prev) => !prev)}
                className="font-mono text-slate-200 hover:text-cyan-300 transition flex items-center gap-1"
              >
                <span>{displayRate}</span>
                <RefreshCw className="h-2.5 w-2.5 opacity-60" />
              </button>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span>Minimum Received</span>
              <span className="font-mono text-slate-200">
                {Number(
                  formatUnits(quote.amountOutMinWei, receiveToken.decimals)
                ).toLocaleString(undefined, { maximumFractionDigits: 4 })}{" "}
                {receiveToken.symbol}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span>Slippage Tolerance</span>
              <span className="font-mono text-cyan-300">{slippage}%</span>
            </div>

            <div className="flex items-center justify-between text-slate-400">
              <span>Liquidity Provider Fee</span>
              <span className="font-mono text-slate-200">{quote.lpFeePercent}%</span>
            </div>

            <div className="flex items-center justify-between text-slate-400 pt-1 border-t border-slate-800/60">
              <span>Routing Path</span>
              <div className="flex items-center gap-1 text-[0.68rem] font-mono text-cyan-400/90">
                {quote.route.isWrap ? (
                  <span>ETN → WETN (Wrap)</span>
                ) : quote.route.isUnwrap ? (
                  <span>WETN → ETN (Unwrap)</span>
                ) : (
                  quote.route.path.map((addr, idx) => (
                    <span key={addr} className="flex items-center gap-1">
                      {idx > 0 ? <ArrowRight className="h-2.5 w-2.5 text-slate-600" /> : null}
                      <span>
                        {addr.toLowerCase() === payToken.address.toLowerCase()
                          ? payToken.symbol
                          : addr.toLowerCase() === receiveToken.address.toLowerCase()
                          ? receiveToken.symbol
                          : "WETN"}
                      </span>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        {/* Error Notice */}
        {quote?.error ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-300">
            <Info className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{quote.error}</span>
          </div>
        ) : null}

        {/* 5. DYNAMIC ACTION BUTTON */}
        <div className="mt-5">
          <Button
            type="button"
            disabled={buttonState.disabled}
            onClick={buttonState.action}
            className={cn(
              "w-full h-12 text-sm font-semibold rounded-xl transition duration-200",
              buttonState.variant === "primary" &&
                "bg-cyan-400 text-slate-950 shadow-glow hover:bg-cyan-300",
              buttonState.variant === "approve" &&
                "bg-amber-400 text-slate-950 shadow-md hover:bg-amber-300",
              buttonState.variant === "disabled" &&
                "bg-slate-900 border border-slate-800 text-slate-500 cursor-not-allowed opacity-75"
            )}
          >
            {approving || buttonState.label.includes("...") ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {buttonState.label}
          </Button>
        </div>
      </div>

      {/* Token Selector Modal */}
      <TokenSelectorModal
        open={selectorTarget !== null}
        onClose={() => setSelectorTarget(null)}
        tokens={tokens}
        selectedToken={selectorTarget === "pay" ? payToken : receiveToken}
        onSelectToken={(token) => {
          if (selectorTarget === "pay") {
            if (token.address.toLowerCase() === receiveToken.address.toLowerCase()) {
              setReceiveToken(payToken);
            }
            setPayToken(token);
          } else {
            if (token.address.toLowerCase() === payToken.address.toLowerCase()) {
              setPayToken(receiveToken);
            }
            setReceiveToken(token);
          }
        }}
        onImportToken={importCustomToken}
        userBalances={balancesMap}
      />

      {/* Transaction Broadcasting & Status Modal */}
      <SwapTxModal
        phase={swapPhase}
        txHash={txHash}
        error={txError}
        onClose={resetTx}
        payToken={payToken}
        receiveToken={receiveToken}
        payAmount={payAmount}
        receiveAmount={receiveAmount}
      />
    </div>
  );
}
