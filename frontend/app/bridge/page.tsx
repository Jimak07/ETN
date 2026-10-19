import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "Bridge — ETN Utility Hub",
  description: "Cross-chain bridge for moving liquidity between ETN-SC and EVM networks.",
};

export default function BridgePage() {
  return (
    <ModuleFallback
      title="Cross-Chain Bridge"
      category="Liquidity Router"
      description="Bridge tokens and native assets between Electroneum Smart Chain (ETN-SC) and major EVM ecosystems."
      iconKey="bridge"
      plannedFeatures={[
        "Bi-directional bridge routing for ETN, Ethereum, and BSC",
        "Cryptographic proof verification and relayer status tracking",
        "Automated wrapped-asset unwrapping and slippage protection",
      ]}
    />
  );
}
