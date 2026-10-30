"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ExternalLink, Flame, Layers, ShieldCheck, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

import { SwapCard } from "@/components/swap/swap-card";
import { ETN_MAINNET } from "@/lib/etn";

const HIGHLIGHTS = [
  { icon: ShieldCheck, label: "Non-custodial", detail: "trade directly from your wallet" },
  { icon: Zap, label: "ElectroSwap V2", detail: "automated liquidity pools" },
  { icon: Sparkles, label: "Custom Tokens", detail: "import any ERC-20 on ETN-SC" },
] as const;

export default function SwapPage() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="mx-auto w-full max-w-[1920px] px-3 py-8 sm:px-6 lg:px-10 lg:py-12 xl:px-12">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-8"
      >
        {/* Navigation & Header */}
        <header className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to ETNVerse Hub
          </Link>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
                  PulseSwap
                </h1>
                <span className="font-mono rounded-full border border-cyan-500/30 bg-cyan-950/30 px-2.5 py-1 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-cyan-300">
                  Routed via ElectroSwap V2 Smart Contracts
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-400">
                Automated Decentralized Token Exchange — swap native ETN, wrapped assets, and verified ecosystem
                tokens with automated liquidity checks, slippage protection, and on-chain contract import.
              </p>
            </div>

            <a
              href={`${ETN_MAINNET.explorerUrl}/token/0x043fAa1b5C5FC9a7dc35171f290c29ECDE0cCff1`}
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

        {/* SWAP TERMINAL CONTAINER (Balanced Responsive 2-Column Grid on Wide Viewports) */}
        <div className="grid gap-8 lg:grid-cols-12 items-start">
          <section className="lg:col-span-7 xl:col-span-7 max-w-xl mx-auto lg:mx-0 w-full">
            <SwapCard />
          </section>

          {/* DEX Routing Intel & Ecosystem Terminal (Expanded on Wide Screens) */}
          <aside className="lg:col-span-5 xl:col-span-5 space-y-4">
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  ElectroSwap V2 Routing Mechanics
                </h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Swaps automatically query live pair reserves on Electroneum Smart Chain (Chain 52014). If a direct liquidity pool does not exist between two assets, the router automatically calculates an optimal multi-hop route via <strong className="text-cyan-300 font-mono">WETN</strong>.
              </p>

              <div className="space-y-2 border-t border-slate-800/80 pt-3 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Routing Protocol</span>
                  <span className="font-mono font-medium text-slate-200">Constant Product (x · y = k)</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>LP Fee per Hop</span>
                  <span className="font-mono font-medium text-cyan-300">0.30%</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Max Slippage Ceiling</span>
                  <span className="font-mono font-medium text-slate-200">20.0% (Clamped)</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>MEV Sandwich Shield</span>
                  <span className="font-mono font-medium text-emerald-400">Active (amountOutMin &gt; 0)</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  Ecosystem Intelligence
                </h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Inspect top token holder distributions, verify whale concentration, or view the live Top 50 ecosystem tokens before trading.
              </p>
              <div className="pt-1 flex flex-wrap gap-2">
                <Link
                  href="/portfolio/leaderboard"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/20 transition"
                >
                  <span>Token Leaderboard</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <Link
                  href="/multi-sender"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition"
                >
                  <span>PulseDrop Multi-Sender</span>
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {/* Footer */}
        <footer className="flex flex-col gap-1 border-t border-slate-800/80 pt-4 text-[0.7rem] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Swaps route through decentralized ElectroSwap V2 liquidity pools on Electroneum Mainnet.
          </p>
          <p className="font-mono">ETNVerse Hub · PulseSwap</p>
        </footer>
      </motion.div>
    </main>
  );
}
