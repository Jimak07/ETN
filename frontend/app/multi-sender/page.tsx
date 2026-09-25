"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ExternalLink, Info, ShieldCheck, Sparkles, TriangleAlert, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { AssetSelector } from "@/components/multi-sender/asset-selector";
import { BulkImportModal, type ImportMode } from "@/components/multi-sender/bulk-import-modal";
import { NetworkSelector } from "@/components/multi-sender/network-selector";
import { RecipientTable } from "@/components/multi-sender/recipient-table";
import { SendPanel } from "@/components/multi-sender/send-panel";
import { SummaryCards } from "@/components/multi-sender/summary-cards";
import { TxModal } from "@/components/multi-sender/tx-modal";
import { Notice } from "@/components/ui/notice";
import { useMultiSender } from "@/hooks/use-multi-sender";
import { useRecipientRows, type RecipientSeed } from "@/hooks/use-recipient-rows";
import { cn } from "@/lib/cn";
import { planBatches } from "@/lib/multi-sender/parse";

/**
 * Multi-Sender module.
 *
 * Composition only: the validity rules are pure (`lib/multi-sender/parse`), the
 * wallet and send sequence live in `useMultiSender`, the row list lives in
 * `useRecipientRows`, and each card owns its own presentation. The page holds
 * exactly one piece of state of its own - whether the bulk import modal is open -
 * so validation, totals and the send call can never disagree about what is being
 * shipped.
 */

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Non-custodial", detail: "funds never touch the contract" },
  { icon: Zap, label: "Gas-optimised", detail: "one signature per 200 recipients" },
  { icon: Sparkles, label: "No protocol fee", detail: "you pay network gas only" },
] as const;

export default function MultiSenderPage() {
  const reduceMotion = useReducedMotion();
  const [bulkImportOpen, setBulkImportOpen] = useState(false);

  const {
    account,
    chainId,
    chain,
    chainOk,
    contractAddress,
    switching,
    switchTo,
    connecting,
    connectionError,
    connect,
    asset,
    setAsset,
    tokenAddress,
    setTokenAddress,
    nftStandard,
    setNftStandard,
    nftTokenId,
    setNftTokenId,
    nftApproved,
    token,
    symbol,
    decimals,
    spendableBalance,
    maxBatchSize,
    progress,
    send,
    reset,
    sendBusy,
    configured,
    configuredAnywhere,
  } = useMultiSender();

  // Rows re-validate against the wallet and the active asset on every render: a
  // different wallet changes which rows are self-transfers, and a token changes
  // the decimals every amount is scaled by.
  const { rows, parsed, update, addRow, appendRows, replaceRows, removeRow, applyUniformAmount } =
    useRecipientRows(decimals, account);

  const batches = useMemo(() => planBatches(parsed.valid, maxBatchSize), [maxBatchSize, parsed.valid]);

  const handleImport = useCallback(
    (imported: readonly RecipientSeed[], mode: ImportMode) => {
      if (mode === "replace") replaceRows(imported);
      else appendRows(imported);
      setBulkImportOpen(false);
    },
    [appendRows, replaceRows],
  );

  const handleSend = useCallback(() => {
    void send(parsed.valid);
  }, [parsed.valid, send]);

  /**
   * What the header badge claims about the wallet's network. An unsupported
   * chain is named rather than hidden, because "which network am I signing on"
   * is the single most consequential thing on this page.
   */
  const networkBadge =
    chainId === null
      ? "wallet not connected"
      : chainOk
        ? `${chain.label} · ${chain.id}`
        : `unsupported · ${chainId}`;
  const networkIsWarning = chainId !== null && (!chainOk || chain.testnet);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-4 lg:space-y-6"
      >
        <header className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to ETN Pulse
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
                  Multi-Sender
                </h1>
                <span
                  className={cn(
                    "num rounded-full border px-2.5 py-1 text-[0.62rem] font-medium uppercase tracking-[0.14em]",
                    networkIsWarning
                      ? "border-status-degraded/40 bg-status-degraded/10 text-status-degraded"
                      : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
                  )}
                >
                  {networkBadge}
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
                Airdrop or pay hundreds of wallets in a single transaction. Build the list in the table, watch every
                row validate, then sign once - the contract forwards each transfer atomically, or reverts the lot.
              </p>
            </div>

            <a
              href={chain.explorerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-xs text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300"
            >
              Block explorer <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          <div className="flex flex-wrap gap-2">
            {HIGHLIGHTS.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-[0.68rem] text-slate-400 backdrop-blur-md"
              >
                <item.icon className="h-3 w-3 text-cyan-300" />
                <span className="font-medium text-slate-300">{item.label}</span>
                <span className="text-slate-500">{item.detail}</span>
              </span>
            ))}
          </div>
        </header>

        {chainOk && chain.testnet ? (
          <Notice
            tone="amber"
            icon={<TriangleAlert className="h-4 w-4" />}
            title="You are on testnet - this ETN has no value"
            detail={
              <>
                Batches are being signed against <span className="num">{chain.name}</span> at{" "}
                <span className="num">{contractAddress ?? "no configured address"}</span>. Switch to Electroneum
                Mainnet when you are ready to move real funds.
              </>
            }
          />
        ) : null}

        {!configuredAnywhere ? (
          <Notice
            tone="amber"
            icon={<Info className="h-4 w-4" />}
            title="No batch sender contract configured - sending is disabled"
            detail={
              <>
                Deploy <span className="num">contracts/src/PulseMultiSender.sol</span> (see{" "}
                <span className="num">contracts/README.md</span>), then set{" "}
                <span className="num">NEXT_PUBLIC_MULTISENDER_MAINNET</span>,{" "}
                <span className="num">NEXT_PUBLIC_MULTISENDER_TESTNET</span> (plus{" "}
                <span className="num">..._ETHEREUM</span> and <span className="num">..._BSC</span> if you deploy
                there) in <span className="num">frontend/.env.local</span> and rebuild. Building the list and
                validating it work without a deployment.
              </>
            }
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
          <div className="min-w-0 lg:col-span-3">
            <RecipientTable
              rows={rows}
              parsed={parsed}
              symbol={symbol}
              decimals={decimals}
              disabled={sendBusy}
              onUpdate={update}
              onRemove={removeRow}
              onAdd={addRow}
              onApplyUniformAmount={applyUniformAmount}
              onBulkImport={() => setBulkImportOpen(true)}
              asset={asset}
              nftStandard={nftStandard}
              nftTokenId={nftTokenId}
              onNftTokenIdChange={setNftTokenId}
            />
          </div>

          <div className="min-w-0 space-y-4 lg:col-span-2">
            <NetworkSelector
              chainId={chainId}
              chain={chain}
              chainOk={chainOk}
              connected={account !== null}
              switching={switching}
              disabled={sendBusy}
              onSelect={switchTo}
            />

            <AssetSelector
              asset={asset}
              onAssetChange={setAsset}
              chain={chain}
              tokenAddress={tokenAddress}
              onTokenAddressChange={setTokenAddress}
              token={token}
              disabled={sendBusy}
              nftStandard={nftStandard}
              onNftStandardChange={setNftStandard}
            />

            <SummaryCards
              validCount={parsed.valid.length}
              issueCount={parsed.issueCount}
              totalWei={parsed.totalWei}
              decimals={decimals}
              symbol={symbol}
              balance={account ? spendableBalance : null}
              batchCount={batches.length}
              maxBatchSize={maxBatchSize}
              chainId={chainId}
              configured={configured}
            />

            <SendPanel
              asset={asset}
              token={token}
              symbol={symbol}
              decimals={decimals}
              recipientCount={parsed.valid.length}
              invalidCount={parsed.issueCount}
              rowCount={parsed.drafts.length}
              batchCount={batches.length}
              totalWei={parsed.totalWei}
              balance={account ? spendableBalance : null}
              account={account}
              chainId={chainId}
              chain={chain}
              chainOk={chainOk}
              switching={switching}
              onSwitchChain={switchTo}
              connecting={connecting}
              connectionError={connectionError}
              onConnect={connect}
              configured={configured}
              contractAddress={contractAddress}
              busy={sendBusy}
              onSend={handleSend}
              nftStandard={nftStandard}
              nftApproved={nftApproved}
              nftTokenId={nftTokenId}
            />
          </div>
        </div>

        <footer className="flex flex-col gap-1 border-t border-slate-800/80 pt-4 text-[0.7rem] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Transfers are irreversible once mined - always send a small test batch first.
          </p>
          <p className="num">ETN Pulse · Multi-Sender module</p>
        </footer>
      </motion.div>

      <BulkImportModal
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onImport={handleImport}
        decimals={decimals}
        selfAddress={account}
        currentRows={rows.length}
        disabled={sendBusy}
      />

      <TxModal
        progress={progress}
        symbol={symbol}
        totalWei={parsed.totalWei}
        decimals={decimals}
        chainId={chainId}
        onClose={reset}
      />
    </main>
  );
}
