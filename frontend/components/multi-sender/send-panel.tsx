"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeftRight, ArrowUpRight, Loader2, Send, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";

import { GlassCard, SectionHeading } from "@/components/ui/glass-card";
import type { AssetKind, NftStandard, TokenState } from "@/hooks/use-multi-sender";
import { cn } from "@/lib/cn";
import { DEFAULT_CHAIN_ID, getChainConfigOrDefault, type ChainConfig } from "@/lib/chains";
import { explorerAddressUrl } from "@/lib/multi-sender/contract";
import { formatTokenAmount } from "@/lib/multi-sender/parse";

/**
 * The signing panel: what is about to move, and the one button that moves it.
 *
 * The network and asset pickers live in their own cards above this one, so this
 * panel is where the consequences are stated - recipient count, total, batch
 * count, the exact contract being called - and where the single reason a send is
 * blocked is named. One reason at a time, in the order the user can act on them:
 * a list of every unmet condition buries the one that is actually blocking.
 */

interface SendPanelProps {
  asset: AssetKind;
  token: TokenState;
  symbol: string;
  decimals: number;
  /** Rows that passed validation - the ones that would be sent. */
  recipientCount: number;
  /** Rows with a real problem. Any of them blocks the whole send. */
  invalidCount: number;
  /** Every row in the table, blank ones included. */
  rowCount: number;
  batchCount: number;
  totalWei: bigint;
  balance: bigint | null;
  account: string | null;
  chainId: number | null;
  chain: ChainConfig;
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
  nftStandard?: NftStandard;
  nftApproved?: boolean | null;
  nftTokenId?: string;
}

export function SendPanel({
  asset,
  token,
  symbol,
  decimals,
  recipientCount,
  invalidCount,
  rowCount,
  batchCount,
  totalWei,
  balance,
  account,
  chainId,
  chain,
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
  nftStandard,
  nftApproved,
  nftTokenId,
}: SendPanelProps) {
  const reduceMotion = useReducedMotion();
  const shortfall = balance !== null && totalWei > balance ? totalWei - balance : 0n;
  const tokenReady = asset === "native" || token.address !== null;
  const approvalNeeded =
    asset === "nft"
      ? tokenReady && nftApproved === false
      : asset !== "native" && tokenReady && (token.allowance ?? 0n) < totalWei;

  /**
   * Ordered by what the user has to do first. Whether a contract is configured
   * depends on the chain, and the chain is only known once a wallet is connected,
   * so the account check has to come before the configuration check.
   */
  const blocker = !account
    ? "Connect a wallet to sign the batch."
    : !chainOk
      ? // Handled by the switch prompt below, which replaces the Send button.
        null
      : !configured
        ? `No batch sender contract is configured for ${chain.name}.`
        : linklessAssetBlocker(asset, token, nftStandard, nftTokenId)
          ?? (rowCount === 0
            ? "Add at least one recipient."
            : invalidCount > 0
              ? `Fix the ${invalidCount} row${invalidCount === 1 ? "" : "s"} marked in the table before sending.`
              : recipientCount === 0
                ? "No valid rows to send yet."
                : shortfall > 0n
                  ? `Insufficient balance - short by ${formatTokenAmount(shortfall, decimals, 4)} ${symbol}.`
                  : null);

  return (
    <GlassCard className="p-5">
      <SectionHeading
        title="Send"
        subtitle="One signature per batch, straight from your wallet"
        icon={<ShieldCheck className="h-4 w-4" />}
      />

      <dl className="mt-4 space-y-1.5 text-[0.7rem]">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Recipients</dt>
          <dd className="num text-slate-300">{recipientCount}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">{asset === "nft" && nftStandard === "erc721" ? "Total NFTs" : "Total"}</dt>
          <dd className="num text-slate-200">
            {asset === "nft" && nftStandard === "erc721"
              ? `${recipientCount} ${symbol}`
              : `${formatTokenAmount(totalWei, decimals, 6)} ${symbol}`}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Transactions</dt>
          <dd className="num text-slate-300">{batchCount}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Network</dt>
          <dd className={cn("num", !chainId ? "text-slate-500" : chainOk ? "text-slate-300" : "text-status-degraded")}>
            {chainId === null
              ? "-"
              : chainOk
                ? `${chain.name} · ${chain.id}`
                : `unsupported · ${chainId}`}
          </dd>
        </div>
      </dl>

      {approvalNeeded ? (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-slate-800 bg-slate-950/50 px-2.5 py-2 text-[0.68rem] leading-relaxed text-slate-400">
          <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-cyan-400" />
          {asset === "nft" ? (
            <span>
              <strong className="text-cyan-300 font-medium">NFT Operator Approval:</strong> You will be prompted to grant operator approval (<code className="text-cyan-200">setApprovalForAll</code>) to the multi-sender contract before sending.
            </span>
          ) : (
            <span>
              <strong className="text-cyan-300 font-medium">Exact allowance only:</strong> Requests approval for exactly{" "}
              <span className="num text-slate-200">{formatTokenAmount(totalWei, decimals, 4)} {symbol}</span>. No
              infinite allowances are requested or left open.
            </span>
          )}
        </p>
      ) : null}

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
           * is moving the wallet. The default network is offered here and the
           * full list sits in the network selector above, so a testnet rehearsal
           * is still one click away without stacking four buttons in this panel.
           */
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-xl border border-status-degraded/30 bg-status-degraded/[0.07] px-3 py-2.5 text-[0.68rem] leading-relaxed text-slate-300">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-degraded" />
              <span>
                Your wallet is on an unsupported network
                {typeof chainId === "number" ? ` (chain ${chainId})` : ""}. Switch to a supported network to send.
              </span>
            </p>

            <button
              type="button"
              onClick={() => onSwitchChain(DEFAULT_CHAIN_ID)}
              disabled={switching}
              className={cn(
                "inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition duration-200 ease-out-expo",
                "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/20 hover:shadow-glow",
                "disabled:cursor-wait disabled:opacity-70",
              )}
            >
              {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
              Switch to {getChainConfigOrDefault(DEFAULT_CHAIN_ID).name}
            </button>

            <p className="text-[0.68rem] leading-relaxed text-slate-500">
              Sending to a testnet instead? Pick it from the network selector above.
            </p>
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
        ) : account && chainOk ? (
          <p className="text-[0.68rem] leading-relaxed text-slate-500">
            Funds move straight from your wallet to each recipient - the contract never holds them.
          </p>
        ) : null}

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

/**
 * The asset half of the blocking rules.
 *
 * Returns null when the asset is ready to send, so the caller can fall through
 * to the row and balance checks with `??`. Kept out of the component body purely
 * to stop the nested ternary above from becoming unreadable.
 */
function linklessAssetBlocker(
  asset: AssetKind,
  token: TokenState,
  nftStandard?: NftStandard,
  nftTokenId?: string,
): string | null {
  if (asset === "native") return null;
  if (token.error) return token.error;
  if (!token.address) {
    return asset === "nft" ? "Enter the NFT contract address." : "Enter the token contract address.";
  }
  if (asset === "nft" && nftStandard === "erc1155") {
    const trimmedId = (nftTokenId ?? "").trim();
    if (trimmedId.length === 0 || !/^\d+$/.test(trimmedId)) {
      return "Enter a valid numeric Token ID for the ERC-1155 batch.";
    }
  }
  return null;
}
