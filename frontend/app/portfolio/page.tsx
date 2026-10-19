import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "Portfolio — ETN Utility Hub",
  description: "Wallet balance tracker, token portfolio valuations, and gas analytics on Electroneum.",
};

export default function PortfolioPage() {
  return (
    <ModuleFallback
      title="Wallet Portfolio & Scanner"
      category="On-Chain Analytics"
      description="Inspect wallet token balances, NFT collections, historical gas spend, and real-time portfolio net worth."
      iconKey="portfolio"
      plannedFeatures={[
        "Blockscout API integration for zero-delay balance resolution",
        "Ecosystem token valuations with live DEX pricing feeds",
        "Historical transaction audit and gas expenditure breakdowns",
      ]}
    />
  );
}
