import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "VerseScan — ETNVerse Hub",
  description: "On-Chain Portfolio & Address Intelligence powered by Electroneum Network Indexer.",
};

export default function ScannerPage() {
  return (
    <ModuleFallback
      title="VerseScan"
      category="ON-CHAIN INTELLIGENCE"
      description="On-Chain Portfolio & Address Intelligence — search any Electroneum Smart Chain address to inspect token transfers, smart contract interactions, and balances."
      iconKey="scanner"
      plannedFeatures={[
        "Electroneum Network Indexer automated token and NFT discovery",
        "Contract verification and ABI decompilation inspection",
        "Wallet risk profiling and token holder analytics",
      ]}
    />
  );
}
