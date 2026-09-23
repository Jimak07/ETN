import { ArrowLeftRight, Coins, Layers, Send, TrendingUp } from "lucide-react";
import Link from "next/link";

import { GlassCard, SectionHeading } from "./ui/glass-card";
import { cn } from "@/lib/cn";

const MODULES = [
  {
    name: "Multi-Sender",
    description: "Airdrop or pay hundreds of wallets in one transaction.",
    icon: Send,
    href: "/multi-sender",
  },
  {
    name: "Swap",
    description: "Route ETN against bridged assets with live slippage guards.",
    icon: ArrowLeftRight,
    href: null,
  },
  {
    name: "Stake",
    description: "Track validator yields and delegations in one place.",
    icon: Coins,
    href: null,
  },
  {
    name: "Bridge",
    description: "Move value between ETN-SC and connected chains.",
    icon: Layers,
    href: null,
  },
  {
    name: "Portfolio",
    description: "Priced balances, gas spend and PnL history.",
    icon: TrendingUp,
    href: null,
  },
] as const;

/** Module rail: live modules link out, the rest show where they will slot in. */
export function ModuleHub() {
  return (
    <GlassCard className="p-5">
      <SectionHeading
        title="Utility Hub"
        subtitle="Pulse and Multi-Sender are live — the rest of the hub plugs into the same shell"
        icon={<Layers className="h-4 w-4" />}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {MODULES.map((module) =>
          module.href ? (
            <Link
              key={module.name}
              href={module.href}
              className="group rounded-xl border border-cyan-500/25 bg-cyan-500/[0.05] p-4 transition duration-300 ease-out-expo hover:border-cyan-400/60 hover:bg-cyan-500/[0.09] hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 ring-1 ring-inset ring-cyan-500/30">
                  <module.icon className="h-4 w-4" />
                </span>
                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-cyan-300">
                  Live
                </span>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-100">{module.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{module.description}</p>
            </Link>
          ) : (
            <div
              key={module.name}
              aria-disabled
              className="group rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 transition duration-300 ease-out-expo hover:border-slate-700/80"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/60 text-slate-400 ring-1 ring-inset ring-slate-700/60 transition group-hover:text-cyan-300">
                  <module.icon className="h-4 w-4" />
                </span>
                <span className="rounded-full bg-slate-800/60 px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.14em] text-slate-500">
                  Soon
                </span>
              </div>
              <p className="mt-3 text-sm font-medium text-slate-200">{module.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{module.description}</p>
            </div>
          ),
        )}
      </div>
    </GlassCard>
  );
}
