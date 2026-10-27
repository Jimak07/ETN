"use client";

import {
  Activity,
  ArrowLeftRight,
  Coins,
  ExternalLink,
  HeartHandshake,
  Layers,
  Send,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";
import { ETN_CHAIN_ID, ETN_CHAIN_NAME, ETN_EXPLORER_URL } from "@/lib/etn";

interface NavModule {
  name: string;
  href: string | null;
  icon: typeof Activity;
  isLive: boolean;
  shortLabel?: string;
}

const NAV_MODULES: readonly NavModule[] = [
  {
    name: "VersePulse",
    shortLabel: "VersePulse",
    href: "/",
    icon: Activity,
    isLive: true,
  },
  {
    name: "PulseDrop",
    shortLabel: "PulseDrop",
    href: "/multi-sender",
    icon: Send,
    isLive: true,
  },
  {
    name: "PulseSwap",
    shortLabel: "PulseSwap",
    href: "/swap",
    icon: ArrowLeftRight,
    isLive: true,
  },
  {
    name: "VerseScan",
    shortLabel: "VerseScan",
    href: null,
    icon: Wallet,
    isLive: false,
  },
  {
    name: "PulseTip",
    shortLabel: "PulseTip",
    href: null,
    icon: HeartHandshake,
    isLive: false,
  },
  {
    name: "PulseStake",
    shortLabel: "PulseStake",
    href: null,
    icon: Coins,
    isLive: false,
  },
  {
    name: "PulseBridge",
    shortLabel: "PulseBridge",
    href: null,
    icon: Layers,
    isLive: false,
  },
];

/**
 * Universal ETNVerse Hub navigation bar.
 * Keeps live tools interactive with glowing badges while strictly locking down
 * unbuilt roadmap modules with muted "COMING SOON" pills and pointer prevention.
 */
export function UtilityNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-slate-100 transition hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 rounded-lg py-1 px-1.5 -ml-1.5"
          >
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            </span>
            <span className="bg-gradient-to-r from-slate-100 via-slate-200 to-cyan-300 bg-clip-text font-bold text-transparent">
              ETNVerse Hub
            </span>
          </Link>
          <span className="hidden sm:inline-flex items-center rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-0.5 text-[0.62rem] font-mono text-slate-400">
            Chain {ETN_CHAIN_ID}
          </span>
        </div>

        {/* Module Navigation Tabs */}
        <nav
          aria-label="ETNVerse Hub modules"
          className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar text-xs"
        >
          {NAV_MODULES.map((item) => {
            const Icon = item.icon;
            const isActive = item.href ? pathname === item.href : false;

            if (item.isLive && item.href) {
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "group relative flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-200 shrink-0",
                    isActive
                      ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200 shadow-sm"
                      : "border-transparent text-slate-400 hover:border-slate-800 hover:bg-slate-900/60 hover:text-slate-200"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5 transition",
                      isActive ? "text-cyan-300" : "text-slate-400 group-hover:text-cyan-300"
                    )}
                  />
                  <span>{item.shortLabel ?? item.name}</span>
                  <span className="flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/15 px-1.5 py-0.2 text-[0.55rem] font-bold uppercase tracking-wider text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.25)]">
                    <span className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse" />
                    LIVE
                  </span>
                </Link>
              );
            }

            // Locked ("COMING SOON") module tab - completely disabled
            return (
              <div
                key={item.name}
                aria-disabled="true"
                title={`${item.name} is coming soon to ETNVerse Hub`}
                className="pointer-events-none select-none flex items-center gap-1.5 rounded-lg border border-transparent bg-slate-950/40 px-2.5 py-1.5 text-xs font-medium text-slate-500 opacity-60 cursor-not-allowed shrink-0"
              >
                <Icon className="h-3.5 w-3.5 text-slate-600" />
                <span>{item.shortLabel ?? item.name}</span>
                <span className="rounded-full border border-slate-700 bg-slate-800/80 px-1.5 py-0.2 text-[0.55rem] font-medium uppercase tracking-wider text-slate-400">
                  COMING SOON
                </span>
              </div>
            );
          })}
        </nav>

        {/* Right Action: Block Explorer */}
        <div className="hidden md:flex items-center shrink-0">
          <a
            href={ETN_EXPLORER_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-cyan-500/40 hover:text-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
          >
            <span>Explorer</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </header>
  );
}
