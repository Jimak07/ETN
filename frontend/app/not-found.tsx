import { ArrowLeft, Compass, ExternalLink } from "lucide-react";
import Link from "next/link";

import { ETN_CHAIN_ID, ETN_CHAIN_NAME, ETN_EXPLORER_URL } from "@/lib/etn";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-4xl flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Not Found Glass Card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent pointer-events-none" />

          <div className="flex flex-col items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800/80 text-cyan-300 ring-1 ring-inset ring-slate-700/80 shadow-lg">
              <Compass className="h-7 w-7 text-cyan-400" />
            </span>

            <span className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-slate-300">
              404 · Page Not Found
            </span>
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-100">
            Route Not Found
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
            The page or module you requested does not exist on the ETN Utility Hub or has been moved.
          </p>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-semibold text-slate-950 shadow-glow transition hover:bg-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Hub</span>
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-[0.7rem] text-slate-500">
          <span>{ETN_CHAIN_NAME} · {ETN_CHAIN_ID}</span>
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
