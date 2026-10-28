import {
  Activity,
  ArrowLeftRight,
  ArrowUpRight,
  Clock,
  Coins,
  HeartHandshake,
  Layers,
  Send,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { GlassCard, SectionHeading } from "./ui/glass-card";

interface HubModule {
  name: string;
  category: string;
  description: string;
  attribution: string;
  icon: typeof Activity;
  href: string | null;
  isLive: boolean;
}

const MODULES: readonly HubModule[] = [
  {
    name: "VersePulse",
    category: "Telemetry & Health",
    description: "Real-Time Block, Gas & RPC Telemetry Monitor",
    attribution: "Direct RPC probes to official & partner nodes",
    icon: Activity,
    href: "/",
    isLive: true,
  },
  {
    name: "PulseDrop",
    category: "Mass Distribution",
    description: "Mass Token & NFT Distribution Engine",
    attribution: "Non-custodial, batch-optimized execution",
    icon: Send,
    href: "/multi-sender",
    isLive: true,
  },
  {
    name: "PulseSwap",
    category: "Decentralized Exchange",
    description: "Automated Decentralized Token Exchange",
    attribution: "Routed via ElectroSwap V2 Smart Contracts",
    icon: ArrowLeftRight,
    href: "/swap",
    isLive: true,
  },
  {
    name: "MyVerse",
    category: "ON-CHAIN INTELLIGENCE",
    description: "Personal Portfolio, Whale Tracker & DeFi Intelligence",
    attribution: "Real-time balance & LP indexing",
    icon: Wallet,
    href: "/portfolio",
    isLive: true,
  },
  {
    name: "PulseTip",
    category: "Creator Monetization",
    description: "Web3 Creator Micro-Tipping & Patronage",
    attribution: "Direct peer-to-peer ETN streams",
    icon: HeartHandshake,
    href: null,
    isLive: false,
  },
  {
    name: "PulseStake",
    category: "Validator Yields",
    description: "Validator Yields & Delegation Tracker",
    attribution: "Consensus telemetry & APY calculator",
    icon: Coins,
    href: null,
    isLive: false,
  },
  {
    name: "PulseBridge",
    category: "Cross-Chain Liquidity",
    description: "Cross-Chain Liquidity Router",
    attribution: "Bi-directional EVM asset bridge",
    icon: Layers,
    href: null,
    isLive: false,
  },
];

/**
 * ETNVerse Hub Dashboard Shell:
 * - Active ("LIVE") modules: VersePulse, PulseDrop, PulseSwap, and MyVerse are interactive with glowing badges.
 * - Locked ("COMING SOON") modules: PulseTip, PulseStake, and PulseBridge are
 *   dimmed (opacity-60), non-interactive (pointer-events-none), and marked with muted COMING SOON badges.
 */
export function ModuleHub() {
  return (
    <GlassCard className="p-5 sm:p-6">
      <SectionHeading
        title="ETNVerse Suite Modules"
        subtitle="Active tools are live on Electroneum Mainnet — upcoming modules locked until deployment"
        icon={<Layers className="h-4 w-4 text-cyan-400" />}
      />

      <div className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MODULES.map((module) => {
          const Icon = module.icon;

          if (module.isLive && module.href) {
            return (
              <Link
                key={module.name}
                href={module.href}
                className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-cyan-500/25 bg-cyan-500/[0.04] p-5 transition-all duration-300 ease-out-expo hover:border-cyan-400/60 hover:bg-cyan-500/[0.08] hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              >
                {/* Hairline subtle glow */}
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent pointer-events-none" />

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-500/30 transition group-hover:bg-cyan-500/25 group-hover:text-cyan-200">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.25)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                      LIVE
                    </span>
                  </div>

                  <p className="mt-3.5 text-[0.65rem] font-mono uppercase tracking-wider text-cyan-400/80">
                    {module.category}
                  </p>
                  <p className="text-sm font-semibold text-slate-100 group-hover:text-white transition">
                    {module.name}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {module.description}
                  </p>
                  <div className="mt-2.5">
                    <span className="inline-flex items-center rounded-md border border-cyan-500/20 bg-cyan-950/40 px-2 py-0.5 text-[0.6rem] font-mono text-cyan-300/90">
                      {module.attribution}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-cyan-500/15 pt-3 text-[0.7rem] text-cyan-400/90 font-medium">
                  <span>Launch module</span>
                  <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 text-cyan-300" />
                </div>
              </Link>
            );
          }

          // Locked ("COMING SOON") module card
          return (
            <div
              key={module.name}
              aria-disabled="true"
              className="pointer-events-none select-none relative flex flex-col justify-between overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40 p-5 opacity-60 transition duration-200"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/60 text-slate-500 ring-1 ring-inset ring-slate-700/60">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-slate-400">
                    COMING SOON
                  </span>
                </div>

                <p className="mt-3.5 text-[0.65rem] font-mono uppercase tracking-wider text-slate-500">
                  {module.category}
                </p>
                <p className="text-sm font-medium text-slate-300">{module.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {module.description}
                </p>
                <div className="mt-2.5">
                  <span className="inline-flex items-center rounded-md border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-[0.6rem] font-mono text-slate-400">
                    {module.attribution}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-1.5 border-t border-slate-800/60 pt-3 text-[0.7rem] text-slate-500">
                <Clock className="h-3 w-3 text-slate-600" />
                <span>Roadmap feature</span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
