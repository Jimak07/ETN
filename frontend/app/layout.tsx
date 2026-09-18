import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const title = "ETN Pulse — Electroneum Smart Chain Monitor";
const description =
  "Real-time block height, gas price and RPC latency telemetry for the Electroneum Smart Chain (ETN-SC, chain 52014).";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "ETN Pulse",
  keywords: [
    "Electroneum",
    "ETN",
    "ETN-SC",
    "block explorer",
    "gas price",
    "RPC latency",
    "Web3 dashboard",
  ],
  openGraph: { title, description, type: "website" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh bg-slate-950 font-sans text-slate-100 antialiased">
        {/* Ambient depth: cyan bloom + faint blueprint grid behind the UI. */}
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-48 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[130px]" />
          <div className="absolute -bottom-52 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/[0.06] blur-[130px]" />
          <div className="bg-grid-slate absolute inset-0 opacity-[0.35]" />
        </div>
        {children}
      </body>
    </html>
  );
}
