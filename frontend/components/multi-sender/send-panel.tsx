"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Loader2,
  Send,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { GlassCard, SectionHeading } from "@/components/ui/glass-card";
import { cn } from "@/lib/cn";
import { ETN_NATIVE_SYMBOL, SUPPORTED_ETN_CHAINS, getEtnChainOrDefault } from "@/lib/etn";
import { formatTokenAmount } from "@/lib/multi-sender/parse";
import { explorerAddressUrl } from "@/lib/multi-sender/contract";
import type { SendMode, TokenState } from "@/hooks/use-multi-sender";

interface SendPanelProps {
  mode: SendMode;
  onModeChange: (mode: SendMode) => void;
  tokenInput: string;
  onTokenInputChange: (value: string) => void;
  token: TokenState;
  decimals: number;
  symbol: string;
  validCount: number;
  batchCount: number;
  totalWei: bigint;
  balance: bigint | null;
  account: string | null;
  chainId: number | null;
  chainOk: boolean;
  switching: boolean;
  onSwitchChain: (chainId: number) => void;
  connecting: boolean;
  connectionError: string | null;
  onConnect: () => void;
  configured: boolean;
  contractAddress: string | null;
  busy: boolean;
  onSend: () => void;
}

export function SendPanel({
  mode,
  onModeChange,
  tokenInput,
  onTokenInputChange,
  token,
  decimals,
  symbol,
  validCount,
  batchCount,
  totalWei,
  balance,
  account,
  chainId,
  chainOk,
  switching,
  onSwitchChain,
  connecting,
  connectionError,
  onConnect,
  configured,
  contractAddress,
  busy,
  onSend,
}: SendPanelProps) {
  const reduceMotion = useReducedMotion();
  const chain = getEtnChainOrDefault(chainId);
  const shortfall = balance !== null && totalWei > balance ? totalWei - balance : 0n;
  const approvalNeeded = mode === "erc20" && token.address !== null && (token.allowance ?? 0n) < totalWei;

  /**
   * One reason at a time, in the order the user can act on them. Showing every
   * unmet condition at once buries the one that is actually blocking the send.
   */
  // Ordered by what the user has to do first. Whether a contract is configured
  // depends on the chain, and the chain is only known once a wallet is connected,
  // so the account check has to come before the configuration check.
  const blocker = !account
    ? "Connect a wallet to sign the batch."
    : !chainOk
      ? // Handled by the switch prompt below, which replaces the Send button.
        null
      : !configured
        ? `No batch sender contract is configured for ${chain.name}.`
        : validCount === 0
          ? "No valid rows to send yet."
          : mode === "erc20" && token.address === null
            ? "Enter the token contract address."
            : shortfall > 0n
              ? `Insufficient balance - short by ${formatTokenAmount(shortfall, decimals, 4)} ${symbol}.`
              : null;

  return (
    <GlassCard className="p-5">
      <SectionHeading
        title="Send"
        subtitle="One signature per batch, straight from your wallet"
        icon={<ShieldCheck className="h-4 w-4" />}
      />

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
        {(["native", "erc20"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onModeChange(option)}
            disabled={busy}
            className={cn(
              "relative rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-60",
              mode === option ? "text-slate-950" : "text-slate-400 hover:text-slate-200",
            )}
          >
            {mode === option ? (
              <motion.span
                layoutId="send-mode"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className={cn(
                  "absolute inset-0 rounded-lg",
                  option === "native" ? "bg-cyan-400" : "bg-slate-200",
                )}
              />
            ) : null}
            <span className="relative">{option === "native" ? `Native ${ETN_NATIVE_SYMBOL}` : "ERC-20 token"}</span>
          </button>
        ))}
      </div>

      {mode === "erc20" ? (
        <div className="mt-3 space-y-2">
          <label className="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-slate-500">
            Token contract
          </label>
          <input
            value={tokenInput}
            onChange={(event) => onTokenInputChange(event.target.value)}
            disabled={busy}
            spellCheck={false}
            placeholder="0x..."
            className={cn(
              "num w-full rounded-xl border bg-slate-950/60 px-3 py-2.5 text-xs text-slate-200",
              "placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/20",
              token.error ? "border-status-offline/50" : "border-slate-800 focus:border-cyan-500/50",
              "disabled:opacity-60",
            )}
          />

          {token.error ? (
            <p className="text-[0.68rem] text-status-offline">{token.error}</p>
          ) : token.loading ? (
            <p className="flex items-center gap-1.5 text-[0.68rem] text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Reading token metadata...
            </p>
          ) : token.address ? (
            <div className="flex flex-wrap items-center gap-1.5 text-[0.68rem] text-slate-500">
              <span className="rounded-full border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-slate-300">
                {token.symbol}
              </span>
              <span className="num rounded-full border border-slate-800 bg-slate-900/60 px-2 py-0.5">
                {token.decimals} decimals
              </span>
              <a
                href={`${chain.explorerUrl}/token/${token.address}`}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-slate-500 transition hover:text-cyan-300"
              >
                explorer <ArrowUpRight className="h-3 w-3" />
              </a>
            </div>
          ) : null}

          {approvalNeeded ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-[0.68rem] leading-relaxed text-slate-400">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-status-degraded" />
              Two transactions: an approval for exactly this batch, then the send. The allowance is spent by the batch,
              never left open.
            </p>
          ) : null}
        </div>
      ) : null}

      <dl className="mt-4 space-y-1.5 border-t border-slate-800/80 pt-3 text-[0.7rem]">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Recipients</dt>
          <dd className="num text-slate-300">{validCount}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Total</dt>
          <dd className="num text-slate-200">
            {formatTokenAmount(totalWei, decimals, 6)} {symbol}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Transactions</dt>
          <dd className="num text-slate-300">{batchCount}</dd>
        </div>
        {chainId !== null ? (
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Network</dt>
            <dd
              className={cn(
                "num",
                !chainOk || chain.testnet ? "text-status-degraded" : "text-slate-300",
              )}
            >
              {chainOk ? `${chain.label} · ${chain.id}` : `unsupported · ${chainId}`}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 space-y-2">
        {!account ? (
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className={cn(
              "group inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition duration-200 ease-out-expo",
              "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/20 hover:shadow-glow",
              "disabled:cursor-wait disabled:opacity-70",
            )}
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {connecting ? "Connecting..." : "Connect wallet"}
          </button>
        ) : !chainOk ? (
          /**
           * A batch signed on the wrong chain sends the wrong asset entirely, so
           * Send is replaced rather than merely disabled: the only useful action
           * is moving the wallet. One button per supported network, because the
           * app cannot know whether this batch is a real airdrop or a rehearsal.
           */
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-xl border border-status-degraded/30 bg-status-degraded/[0.07] px-3 py-2.5 text-[0.68rem] leading-relaxed text-slate-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-degraded" />
              <span>
                Your wallet is on an unsupported network
                {typeof chainId === "number" ? ` (chain ${chainId})` : ""}. Switch to an Electroneum network to
                send.
              </span>
            </p>

            {SUPPORTED_ETN_CHAINS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => onSwitchChain(option.id)}
                disabled={switching}
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition duration-200 ease-out-expo",
                  "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/20 hover:shadow-glow",
                  "disabled:cursor-wait disabled:opacity-70",
                )}
              >
                {switching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowLeftRight className="h-4 w-4" />
                )}
                Switch to {option.name}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={busy || blocker !== null}
            className={cn(
              "group inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition duration-200 ease-out-expo",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
              blocker === null
                ? "bg-cyan-400 text-slate-950 hover:bg-cyan-300 hover:shadow-glow"
                : "cursor-not-allowed border border-slate-800 bg-slate-900/60 text-slate-500",
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? "Sending..." : batchCount > 1 ? `Send ${batchCount} batches` : "Send batch"}
          </button>
        )}

        {blocker ? (
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[0.68rem] leading-relaxed text-slate-500"
          >
            {blocker}
          </motion.p>
        ) : (
          <p className="text-[0.68rem] leading-relaxed text-slate-500">
            Funds move straight from your wallet to each recipient - the contract never holds them.
          </p>
        )}

        {connectionError ? (
          <p role="alert" className="text-[0.68rem] leading-relaxed text-status-offline">
            {connectionError}
          </p>
        ) : null}

        {contractAddress ? (
          <a
            href={explorerAddressUrl(chainId, contractAddress)}
            target="_blank"
            rel="noreferrer noopener"
            className="num inline-flex items-center gap-1 text-[0.62rem] text-slate-600 transition hover:text-cyan-300"
          >
            contract {contractAddress.slice(0, 10)}...{contractAddress.slice(-6)}
            <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </GlassCard>
  );
}
