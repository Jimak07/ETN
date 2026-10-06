"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Loader2,
  Lock,
  Send,
  ShieldCheck,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AssetKind, NftStandard, TokenState } from "@/hooks/use-multi-sender";
import { cn } from "@/lib/cn";
import {
  DEFAULT_CHAIN_ID,
  SUPPORTED_CHAINS,
  getChainConfigOrDefault,
  type ChainConfig,
} from "@/lib/chains";
import { explorerAddressUrl } from "@/lib/multi-sender/contract";
import { formatTokenAmount } from "@/lib/multi-sender/parse";

interface SendPanelProps {
  asset: AssetKind;
  token: TokenState;
  symbol: string;
  decimals: number;
  recipientCount: number;
  invalidCount: number;
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
  onApprove?: () => void;
  approving?: boolean;
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
  onApprove,
  approving = false,
}: SendPanelProps) {
  const reduceMotion = useReducedMotion();
  const multiSenderAddress =
    typeof chainId === "number"
      ? (SUPPORTED_CHAINS[chainId]?.multiSenderAddress ?? contractAddress)
      : contractAddress;
  const isDeployed = Boolean(multiSenderAddress && configured);

  const shortfall = balance !== null && totalWei > balance ? totalWei - balance : 0n;
  const tokenReady = asset === "native" || token.address !== null;

  const approvalNeeded =
    isDeployed &&
    (asset === "nft"
      ? tokenReady && nftApproved === false
      : asset !== "native" && tokenReady && (token.allowance ?? 0n) < totalWei);

  // Aggressive guardrails
  const hasErrors = invalidCount > 0;
  const hasNoRecipients = rowCount === 0 || recipientCount === 0;

  const assetBlocker = linklessAssetBlocker(asset, token, nftStandard, nftTokenId);

  const blocker = !account
    ? "Connect a wallet to sign the batch."
    : !chainOk
      ? null
      : !isDeployed
        ? "The Multi-Sender contract is not yet deployed on this network."
        : assetBlocker ??
          (hasErrors
            ? `Please fix the ${invalidCount} invalid address row(s) before proceeding.`
            : hasNoRecipients
              ? "Add at least one recipient with an amount/Token ID."
              : shortfall > 0n && asset !== "nft"
                ? `Insufficient balance - short by ${formatTokenAmount(shortfall, decimals, 4)} ${symbol}.`
                : null);

  const isExecutionDisabled =
    busy || approving || !isDeployed || hasErrors || hasNoRecipients || blocker !== null;

  return (
    <Card className="p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/80 text-cyan-400">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-100">
              Execution & Summary
            </h2>
            <p className="text-[0.68rem] text-slate-400">
              Verify batch totals and broadcast securely via non-custodial smart contract
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-mono rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-wider",
              chainId === null
                ? "border-slate-800 bg-slate-900 text-slate-500"
                : chainOk
                  ? "border-cyan-500/30 bg-cyan-950/30 text-cyan-300"
                  : "border-amber-500/40 bg-amber-950/30 text-amber-300"
            )}
          >
            {chainId === null
              ? "Wallet Disconnected"
              : chainOk
                ? `${chain.name} (${chain.id})`
                : `Unsupported Chain (${chainId})`}
          </span>
        </div>
      </div>

      {/* Summary Stats Grid */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Stat 1: Total Recipients */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[0.62rem] font-semibold uppercase tracking-wider">
              Total Recipients
            </span>
            <Users className="h-3.5 w-3.5" />
          </div>
          <p className="font-mono mt-1 text-2xl font-bold tracking-tight text-slate-100">
            {recipientCount}
          </p>
          <div className="mt-1 text-[0.68rem]">
            {hasErrors ? (
              <span className="flex items-center gap-1 font-medium text-rose-400">
                <AlertCircle className="h-3 w-3" /> {invalidCount} flagged error(s)
              </span>
            ) : recipientCount > 0 ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> All rows validated
              </span>
            ) : (
              <span className="text-slate-500">0 queued</span>
            )}
          </div>
        </div>

        {/* Stat 2: Total to Send */}
        <div className="rounded-xl border border-cyan-500/20 bg-slate-950/60 p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-cyan-400">
            <span className="text-[0.62rem] font-semibold uppercase tracking-wider">
              {asset === "nft" && nftStandard === "erc721" ? "Total NFTs" : "Total to Send"}
            </span>
            <Coins className="h-3.5 w-3.5" />
          </div>
          <p className="font-mono mt-1 truncate text-2xl font-bold tracking-tight text-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.3)]">
            {asset === "nft" && nftStandard === "erc721"
              ? `${recipientCount} ${symbol}`
              : `${formatTokenAmount(totalWei, decimals, 4)} ${symbol}`}
          </p>
          <p className="font-mono mt-1 text-[0.68rem] text-slate-400">
            {batchCount > 1 ? `${batchCount} transactions needed` : "1 batch transaction"}
          </p>
        </div>

        {/* Stat 3: Wallet Balance */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[0.62rem] font-semibold uppercase tracking-wider">
              Wallet Balance
            </span>
            <Wallet className="h-3.5 w-3.5" />
          </div>
          <p
            className={cn(
              "font-mono mt-1 truncate text-2xl font-bold tracking-tight",
              balance === null
                ? "text-slate-500"
                : shortfall > 0n
                  ? "text-rose-400"
                  : "text-slate-100"
            )}
          >
            {balance === null ? "—" : `${formatTokenAmount(balance, decimals, 4)} ${symbol}`}
          </p>
          <div className="mt-1 text-[0.68rem]">
            {shortfall > 0n && asset !== "nft" ? (
              <span className="font-medium text-rose-400">
                Short by {formatTokenAmount(shortfall, decimals, 4)} {symbol}
              </span>
            ) : balance !== null ? (
              <span className="text-slate-400">
                Leaves {formatTokenAmount(balance - totalWei, decimals, 4)} {symbol}
              </span>
            ) : (
              <span className="text-slate-500">Connect wallet to view</span>
            )}
          </div>
        </div>
      </div>

      {/* Operator Allowance Notice */}
      {approvalNeeded ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-xs text-slate-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
          {asset === "nft" ? (
            <div>
              <strong className="text-cyan-300 font-semibold">NFT Operator Approval Required:</strong>{" "}
              <span>
                Before batching NFTs, you will authorize the Multi-Sender contract as an operator (
                <code className="font-mono text-cyan-200">setApprovalForAll</code>).
              </span>
            </div>
          ) : (
            <div>
              <strong className="text-cyan-300 font-semibold">Exact Allowance Policy:</strong>{" "}
              <span>
                This transaction approves exactly{" "}
                <span className="font-mono text-cyan-200">
                  {formatTokenAmount(totalWei, decimals, 4)} {symbol}
                </span>
                . No unlimited or infinite approvals are ever requested.
              </span>
            </div>
          )}
        </div>
      ) : null}

      {/* Safety Guardrail Alert: Invalid addresses */}
      {hasErrors ? (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Execution Blocked: Flagged Addresses</AlertTitle>
          <AlertDescription>
            {invalidCount} row(s) contain invalid or malformed wallet addresses. Batch approval and
            sending are strictly disabled until you correct all flagged rows in the table.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Safety Guardrail Alert: Contract not deployed on current network */}
      {!isDeployed && account && chainOk ? (
        <Alert variant="warning" className="mt-4">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Contract Not Deployed</AlertTitle>
          <AlertDescription>
            The Multi-Sender smart contract is not yet deployed on {chain.name}.
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Execution Actions */}
      <div className="mt-4 space-y-3">
        {!account ? (
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onConnect}
            disabled={connecting}
            className="w-full text-sm font-semibold"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4 text-cyan-400" />}
            {connecting ? "Connecting Wallet..." : "Connect Wallet"}
          </Button>
        ) : !chainOk ? (
          <div className="space-y-2">
            <Alert variant="warning">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Unsupported Network</AlertTitle>
              <AlertDescription>
                Your wallet is on an unsupported chain ({chainId}). Switch to a supported network to
                send.
              </AlertDescription>
            </Alert>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => onSwitchChain(DEFAULT_CHAIN_ID)}
              disabled={switching}
              className="w-full text-sm font-semibold"
            >
              {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4 text-cyan-400" />}
              Switch to {getChainConfigOrDefault(DEFAULT_CHAIN_ID).name}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Explicit Approve Button (if required) */}
            {approvalNeeded ? (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={onApprove}
                disabled={isExecutionDisabled || approving}
                className={cn(
                  "flex-1 text-xs sm:text-sm font-semibold transition-all duration-200",
                  isExecutionDisabled && "cursor-not-allowed opacity-50"
                )}
              >
                {approving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Lock className="h-4 w-4 text-cyan-400" />
                )}
                {approving
                  ? "Approving..."
                  : asset === "nft"
                    ? "Approve Multi-Sender for NFTs"
                    : `Approve ${formatTokenAmount(totalWei, decimals, 2)} ${symbol}`}
              </Button>
            ) : null}

            {/* Glowing High-Contrast Send Batch Button */}
            <Button
              type="button"
              variant="glow"
              size="lg"
              onClick={onSend}
              disabled={isExecutionDisabled}
              className={cn(
                "flex-1 text-xs sm:text-sm font-semibold tracking-wide shadow-glow transition-all duration-200",
                isExecutionDisabled
                  ? "cursor-not-allowed border border-slate-800 bg-slate-900 text-slate-500 shadow-none opacity-50"
                  : "bg-cyan-400 text-slate-950 hover:bg-cyan-300"
              )}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4 text-slate-950" />
              )}
              {busy
                ? "Broadcasting Batch..."
                : hasErrors
                  ? "Resolve Errors to Send"
                  : batchCount > 1
                    ? `Send ${batchCount} Batches (${recipientCount} recipients)`
                    : `Send Batch (${recipientCount} recipients)`}
            </Button>
          </div>
        )}

        {/* Dynamic Blocker Caption */}
        {blocker && isDeployed && !hasErrors ? (
          <motion.p
            initial={reduceMotion ? false : { opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center text-[0.68rem] text-slate-400"
          >
            {blocker}
          </motion.p>
        ) : account && chainOk && isDeployed && !hasErrors ? (
          <p className="text-center text-[0.68rem] text-slate-500">
            Funds move directly from your wallet to recipients atomically — the contract never holds custody.
          </p>
        ) : null}

        {connectionError ? (
          <p role="alert" className="text-center text-xs text-rose-400">
            {connectionError}
          </p>
        ) : null}

        {contractAddress && isDeployed ? (
          <div className="flex justify-center pt-1">
            <a
              href={explorerAddressUrl(chainId, contractAddress)}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono inline-flex items-center gap-1 text-[0.68rem] text-slate-500 transition hover:text-cyan-300"
            >
              Verified Contract: {contractAddress.slice(0, 10)}...{contractAddress.slice(-6)}
              <ArrowUpRight className="h-3 w-3" />
            </a>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

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
