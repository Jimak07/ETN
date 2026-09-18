import { ArrowLeftRight, Coins, Layers, TrendingUp } from "lucide-react";

import { GlassCard, SectionHeading } from "./ui/glass-card";

const MODULES = [
  {
    name: "Swap",
    description: "Route ETN against bridged assets with live slippage guards.",
    icon: ArrowLeftRight,
  },
  {
    name: "Stake",
    description: "Track validator yields and delegations in one place.",
    icon: Coins,
  },
  {
    name: "Bridge",
    description: "Move value between ETN-SC and connected chains.",
    icon: Layers,
  },
  {
    name: "Portfolio",
    description: "Priced balances, gas spend and PnL history.",
    icon: TrendingUp,
  },
] as const;

/** Placeholder rail showing where the next hub modules slot in. */
export function ModuleHub() {
  return (
    <GlassCard className="p-5">
      <SectionHeading
        title="Utility Hub"
        subtitle="Pulse is module one — the rest of the hub plugs into the same shell"
        icon={<Layers className="h-4 w-4" />}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MODULES.map((module) => (
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
        ))}
      </div>
    </GlassCard>
  );
}
