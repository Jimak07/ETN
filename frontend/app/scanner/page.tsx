import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "Wallet Scanner — ETN Utility Hub",
  description: "Electroneum Smart Chain address explorer and portfolio scanner.",
};

export default function ScannerPage() {
  return (
    <ModuleFallback
      title="Wallet Scanner"
      category="Blockscout Lookups"
      description="Search any Electroneum Smart Chain address to inspect token transfers, smart contract interactions, and balances."
      iconKey="scanner"
      plannedFeatures={[
        "Blockscout V2 API automated token and NFT discovery",
        "Contract verification and ABI decompilation inspection",
        "Wallet risk profiling and token holder analytics",
      ]}
    />
  );
}
