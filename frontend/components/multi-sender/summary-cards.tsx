"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Coins, Users, Wallet } from "lucide-react";
import type { ReactNode } from "react";

import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/cn";
import { isSupportedEtnChain } from "@/lib/etn";
import { formatTokenAmount } from "@/lib/multi-sender/parse";

/**
 * The three numbers a sender checks before signing: how many rows survived
 * validation, what the run costs, and whether the wallet can cover it.
 */

interface SummaryCardsProps {
  validCount: number;
  issueCount: number;
  totalWei: bigint;
  decimals: number;
  symbol: string;
  balance: bigint | null;
  batchCount: number;
  maxBatchSize: number;
  chainId: number | null;
  configured: boolean;
}

interface TileProps {
  label: string;
  icon: ReactNode;
  value: string;
  hint: ReactNode;
  tone?: string;
}

function Tile({ label, icon, value, hint, tone = "text-slate-50" }: TileProps) {
  const reduceMotion = useReducedMotion();

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[0.62rem] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className="text-slate-500">{icon}</span>
      </div>
      <motion.p
        key={value}
        initial={reduceMotion ? false : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={cn("num mt-2 truncate text-xl font-semibold leading-none", tone)}
      >
        {value}
      </motion.p>
      <div className="mt-1.5 text-[0.68rem] leading-relaxed text-slate-500">{hint}</div>
    </GlassCard>
  );
}

export function SummaryCards({
  validCount,
  issueCount,
  totalWei,
  decimals,
  symbol,
  balance,
  batchCount,
  maxBatchSize,
  chainId,
  configured,
}: SummaryCardsProps) {
  const shortfall = balance !== null && totalWei > balance ? totalWei - balance : 0n;
  const chainOk = isSupportedEtnChain(chainId);

  // Disconnected beats unsupported: with no chain at all the useful instruction
  // is to connect, not to switch somewhere specific.
  const balanceHint = (() => {
    if (chainId === null) return "Connect a wallet to read the balance";
    if (!chainOk) return "Switch to an Electroneum network";
    if (!configured) return "No contract deployed on this network yet";
    if (balance === null) return "Could not read the balance on this network";
    if (shortfall > 0n) {
      return (
        <>
          Short by{" "}
          <span className="num text-status-offline">
            {formatTokenAmount(shortfall, decimals, 4)} {symbol}
          </span>
        </>
      );
    }
    return (
      <>
        Leaves <span className="num text-slate-400">{formatTokenAmount(balance - totalWei, decimals, 4)}</span> after the
        run
      </>
    );
  })();

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
      <Tile
        label="Total addresses"
        icon={<Users className="h-3.5 w-3.5" />}
        value={String(validCount)}
        tone={validCount > 0 ? "text-slate-50" : "text-slate-500"}
        hint={
          issueCount > 0 ? (
            <>
              <span className="num text-status-offline">{issueCount}</span> row
              {issueCount === 1 ? "" : "s"} excluded by validation
            </>
          ) : (
            "every row passed validation"
          )
        }
      />

      <Tile
        label={configured ? "Total to send" : "Total to send"}
        icon={<Coins className="h-3.5 w-3.5" />}
        value={`${formatTokenAmount(totalWei, decimals, 4)} ${symbol}`}
        tone="text-cyan-300"
        hint={
          batchCount > 1
            ? `${batchCount} transactions, ${maxBatchSize} recipients each`
            : "one transaction"
        }
      />

      <Tile
        label="Wallet balance"
        icon={<Wallet className="h-3.5 w-3.5" />}
        value={
          balance === null
            ? "Not connected"
            : `${formatTokenAmount(balance, decimals, 4)} ${symbol}`
        }
        tone={balance === null ? "text-slate-500" : shortfall > 0n ? "text-status-offline" : "text-slate-50"}
        hint={balanceHint}
      />
    </div>
  );
}
