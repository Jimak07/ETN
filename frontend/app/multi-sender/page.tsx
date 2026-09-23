"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ExternalLink, Info, ShieldCheck, Sparkles, TriangleAlert, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { RecipientInput } from "@/components/multi-sender/recipient-input";
import { SendPanel } from "@/components/multi-sender/send-panel";
import { SummaryCards } from "@/components/multi-sender/summary-cards";
import { TxModal } from "@/components/multi-sender/tx-modal";
import { ValidationPanel } from "@/components/multi-sender/validation-panel";
import { Notice } from "@/components/ui/notice";
import { useMultiSender } from "@/hooks/use-multi-sender";
import { cn } from "@/lib/cn";
import { ETN_NATIVE_SYMBOL } from "@/lib/etn";
import { planBatches, parseRecipientList } from "@/lib/multi-sender/parse";

/**
 * Multi-Sender module.
 *
 * Composition only: the parse/validate step is pure (`lib/multi-sender/parse`),
 * the wallet and send sequence live in `useMultiSender`, and each panel owns its
 * own presentation. The page holds the two pieces of state that panels must
 * agree on - the pasted list and the asset being sent - so validation, totals
 * and the send call can never disagree about what is being shipped.
 */

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Non-custodial", detail: "funds never touch the contract" },
  { icon: Zap, label: "Gas-optimised", detail: "one signature per 200 recipients" },
  { icon: Sparkles, label: "No protocol fee", detail: "you pay network gas only" },
] as const;

export default function MultiSenderPage() {
  const reduceMotion = useReducedMotion();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);

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
    mode,
    setMode,
    tokenInput,
    setTokenInput,
    token,
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

  const symbol = mode === "native" ? ETN_NATIVE_SYMBOL : token.symbol;

  // Re-validates on every keystroke and whenever the wallet or asset changes,
  // because both move the goalposts: a different wallet changes which rows are
  // self-transfers, and a token changes the decimals every amount is scaled by.
  const parsed = useMemo(
    () => parseRecipientList(text, { decimals, selfAddress: account }),
    [account, decimals, text],
  );

  const batches = useMemo(() => planBatches(parsed.valid, maxBatchSize), [maxBatchSize, parsed.valid]);

  const handleFile = useCallback((name: string, contents: string) => {
    setFileName(name);
    setText(contents);
  }, []);

  const handleTextChange = useCallback((value: string) => {
    setText(value);
    setFileName(null);
  }, []);

  const handleSend = useCallback(() => {
    void send(parsed.valid);
  }, [parsed.valid, send]);

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
                Airdrop or pay hundreds of wallets in a single transaction. Validate the list in the browser, then sign
                once - the contract forwards every transfer atomically, or reverts the lot.
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
                <span className="num">{contractAddress ?? "no configured address"}</span>. Switch your wallet to
                Electroneum Mainnet when you are ready to move real funds.
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
                <span className="num">NEXT_PUBLIC_MULTISENDER_MAINNET</span> and{" "}
                <span className="num">NEXT_PUBLIC_MULTISENDER_TESTNET</span> in{" "}
                <span className="num">frontend/.env.local</span> and rebuild. Parsing and validation work without it.
              </>
            }
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
          <div className="min-w-0 space-y-4 lg:col-span-3">
            <RecipientInput
              value={text}
              onChange={handleTextChange}
              onFile={handleFile}
              fileName={fileName}
              parsedRows={parsed.rows.length}
              disabled={sendBusy}
            />
            <ValidationPanel parsed={parsed} symbol={symbol} decimals={decimals} />
          </div>

          <div className="min-w-0 space-y-4 lg:col-span-2">
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
              mode={mode}
              onModeChange={setMode}
              tokenInput={tokenInput}
              onTokenInputChange={setTokenInput}
              token={token}
              decimals={decimals}
              symbol={symbol}
              validCount={parsed.valid.length}
              batchCount={batches.length}
              totalWei={parsed.totalWei}
              balance={account ? spendableBalance : null}
              account={account}
              chainId={chainId}
              chainOk={chainOk}
              switching={switching}
              onSwitchChain={(target) => void switchTo(target)}
              connecting={connecting}
              connectionError={connectionError}
              onConnect={() => void connect()}
              configured={configured}
              contractAddress={contractAddress}
              busy={sendBusy}
              onSend={handleSend}
            />
          </div>
        </div>

        <footer className="flex flex-col gap-2 border-t border-slate-800/80 pt-5 text-[0.7rem] text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Transfers are irreversible once mined - always send a small test batch first.
          </p>
          <p className="num">ETN Pulse · Multi-Sender module</p>
        </footer>
      </motion.div>

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
