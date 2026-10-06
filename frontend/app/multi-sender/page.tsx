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
import { TxModal } from "@/components/multi-sender/tx-modal";
import { Notice } from "@/components/ui/notice";
import { useMultiSender } from "@/hooks/use-multi-sender";
import { useRecipientRows, type RecipientSeed } from "@/hooks/use-recipient-rows";
import { cn } from "@/lib/cn";
import { planBatches } from "@/lib/multi-sender/parse";

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
    approve,
    approving,
    reset,
    sendBusy,
    configured,
    configuredAnywhere,
  } = useMultiSender();

  // Rows re-validate against the wallet and the active asset on every render/keystroke
  const { rows, parsed, update, addRow, appendRows, replaceRows, removeRow, applyUniformAmount } =
    useRecipientRows(decimals, account);

  const batches = useMemo(() => planBatches(parsed.valid, maxBatchSize), [maxBatchSize, parsed.valid]);

  const handleImport = useCallback(
    (imported: readonly RecipientSeed[], mode: ImportMode) => {
      if (mode === "replace") replaceRows(imported);
      else appendRows(imported);
      setBulkImportOpen(false);
    },
    [appendRows, replaceRows]
  );

  const handleSend = useCallback(() => {
    void send(parsed.valid);
  }, [parsed.valid, send]);

  const handleApprove = useCallback(() => {
    void approve(parsed.totalWei);
  }, [approve, parsed.totalWei]);

  const networkBadge =
    chainId === null
      ? "wallet not connected"
      : chainOk
        ? `${chain.label} · ${chain.id}`
        : `unsupported · ${chainId}`;
  const networkIsWarning = chainId !== null && (!chainOk || chain.testnet);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-6"
      >
        {/* Navigation & Header */}
        <header className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to ETN Pulse
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
                  Multi-Sender dApp
                </h1>
                <span
                  className={cn(
                    "font-mono rounded-full border px-2.5 py-1 text-[0.62rem] font-medium uppercase tracking-[0.14em]",
                    networkIsWarning
                      ? "border-amber-500/40 bg-amber-950/20 text-amber-300"
                      : "border-cyan-500/30 bg-cyan-950/30 text-cyan-300"
                  )}
                >
                  {networkBadge}
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-400">
                Bulk transfer native tokens, ERC-20 coins, or NFT collections in batch transactions.
                Strictly non-custodial with automated checksum and address validation.
              </p>
            </div>

            <a
              href={chain.explorerUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300"
            >
              Block Explorer <ExternalLink className="h-3 w-3" />
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

        {/* Network & Environment Notices */}
        {chainOk && chain.testnet ? (
          <Notice
            tone="amber"
            icon={<TriangleAlert className="h-4 w-4" />}
            title="You are connected to Testnet"
            detail={
              <>
                Batches are executed against <span className="font-mono">{chain.name}</span>. Switch to Electroneum
                Mainnet when you are ready to disburse real mainnet funds.
              </>
            }
          />
        ) : null}

        {!configuredAnywhere ? (
          <Notice
            tone="amber"
            icon={<Info className="h-4 w-4" />}
            title="No batch sender contract configured"
            detail={
              <>
                Deploy <span className="font-mono">PulseMultiSender.sol</span> on this network and configure the address
                to enable live on-chain broadcasting.
              </>
            }
          />
        ) : null}

        {/* Network Selection Bar */}
        <NetworkSelector
          chainId={chainId}
          chain={chain}
          chainOk={chainOk}
          connected={account !== null}
          switching={switching}
          disabled={sendBusy}
          onSelect={switchTo}
        />

        {/* STRICT TOP-TO-BOTTOM FLOW */}
        <div className="space-y-6">
          {/* 1. TOP SECTION: Asset Selection Card */}
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

          {/* 2. MIDDLE SECTION: Recipient Entry Card with prominent Import CSV button */}
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

          {/* 3. BOTTOM SECTION: Execution Card (Summary stats + Glowing Approve/Send buttons) */}
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
            onApprove={handleApprove}
            approving={approving}
            nftStandard={nftStandard}
            nftApproved={nftApproved}
            nftTokenId={nftTokenId}
          />
        </div>

        {/* Footer */}
        <footer className="flex flex-col gap-1 border-t border-slate-800/80 pt-4 text-[0.7rem] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Transactions are irreversible once broadcast and confirmed on the Electroneum network.
          </p>
          <p className="font-mono">ETN Pulse · Multi-Sender Suite</p>
        </footer>
      </motion.div>

      {/* Smart CSV Bulk Import Modal */}
      <BulkImportModal
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onImport={handleImport}
        decimals={decimals}
        selfAddress={account}
        currentRows={rows.length}
        disabled={sendBusy}
      />

      {/* Transaction Broadcasting Status Modal */}
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
