import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "VerseScan — ETNVerse Hub",
  description: "On-Chain Portfolio & Address Intelligence powered by Electroneum Network Indexer.",
};

export default function PortfolioPage() {
  return (
    <ModuleFallback
      title="VerseScan"
      category="ON-CHAIN INTELLIGENCE"
      description="On-Chain Portfolio & Address Intelligence — inspect wallet token balances, NFT collections, historical gas spend, and real-time portfolio net worth."
      iconKey="portfolio"
      plannedFeatures={[
        "Electroneum Network Indexer integration for zero-delay balance resolution",
        "Ecosystem token valuations with live DEX pricing feeds",
        "Historical transaction audit and gas expenditure breakdowns",
      ]}
    />
  );
}
