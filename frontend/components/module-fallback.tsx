import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  Clock,
  Coins,
  ExternalLink,
  HeartHandshake,
  Layers,
  Send,
  Wallet,
} from "lucide-react";
import Link from "next/link";

import { ETN_CHAIN_ID, ETN_CHAIN_NAME, ETN_EXPLORER_URL } from "@/lib/etn";

const ICON_MAP = {
  stake: Coins,
  bridge: Layers,
  portfolio: Wallet,
  "tip-studio": HeartHandshake,
  scanner: Wallet,
  default: Activity,
} as const;

export type FallbackIconKey = keyof typeof ICON_MAP;

interface ModuleFallbackProps {
  title: string;
  category: string;
  description: string;
  iconKey?: FallbackIconKey;
  plannedFeatures?: readonly string[];
}

/**
 * Centered route guardrail fallback card for unbuilt/roadmap modules.
 * Renders cleanly as a React Server Component.
 */
export function ModuleFallback({
  title,
  category,
  description,
  iconKey = "default",
  plannedFeatures = [],
}: ModuleFallbackProps) {
  const Icon = ICON_MAP[iconKey] ?? ICON_MAP.default;

  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-xl space-y-6 text-center">
        {/* Navigation Breadcrumb */}
        <div className="flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-cyan-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Utility Hub
          </Link>
        </div>

        {/* Fallback Glass Card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {/* Subtle top cyan glow */}
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent pointer-events-none" />

          {/* Module Icon & Status Badge */}
          <div className="flex flex-col items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/80 text-cyan-300 ring-1 ring-inset ring-slate-700/80 shadow-lg">
              <Icon className="h-7 w-7 text-cyan-400" />
            </span>

            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-slate-300">
                COMING SOON
              </span>
              <span className="font-mono rounded-full border border-slate-800 bg-slate-950/60 px-2.5 py-0.5 text-[0.65rem] text-slate-400">
                {ETN_CHAIN_NAME} · {ETN_CHAIN_ID}
              </span>
            </div>
          </div>

          {/* Titles */}
          <div className="mt-4 space-y-1.5">
            <p className="font-mono text-xs uppercase tracking-wider text-cyan-400">
              {category}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
              {title}
            </h1>
            <p className="mx-auto max-w-md text-xs sm:text-sm leading-relaxed text-slate-400 pt-1">
              {description}
            </p>
          </div>

          {/* Roadmap Info Box */}
          <div className="mt-6 rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 text-left">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <Clock className="h-3.5 w-3.5 text-cyan-400" />
              <span>Development Status & Roadmap</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
              This module is scheduled for deployment on the Electroneum Smart Chain.
              Interactive transactions are locked until smart contract verification and audit phases are complete.
            </p>

            {plannedFeatures.length > 0 ? (
              <ul className="mt-3 space-y-1.5 border-t border-slate-800/60 pt-2.5 text-xs text-slate-300">
                {plannedFeatures.map((feat) => (
                  <li key={feat} className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-cyan-400" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Active Navigation Actions */}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-semibold text-slate-950 shadow-glow transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Back to ETN Pulse</span>
            </Link>

            <Link
              href="/multi-sender"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-xs font-medium text-cyan-300 transition hover:bg-cyan-500/20 hover:border-cyan-400/50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Open Multi-Sender</span>
            </Link>

            <Link
              href="/swap"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>Open Swap</span>
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-center gap-4 text-[0.7rem] text-slate-500">
          <span>ETN Pulse · Modular Utility Hub</span>
          <span>·</span>
          <a
            href={ETN_EXPLORER_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 hover:text-cyan-300 transition"
          >
            Block Explorer <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </main>
  );
}
