import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "PulseBridge — ETNVerse Hub",
  description: "Cross-Chain Liquidity Router for moving value between ETN-SC and EVM ecosystems.",
};

export default function BridgePage() {
  return (
    <ModuleFallback
      title="PulseBridge"
      category="Cross-Chain Liquidity"
      description="Cross-Chain Liquidity Router — bi-directional EVM asset bridge between Electroneum and major chains."
      iconKey="bridge"
      plannedFeatures={[
        "Bi-directional bridge routing for ETN, Ethereum, and BSC",
        "Cryptographic proof verification and relayer status tracking",
        "Automated wrapped-asset unwrapping and slippage protection",
      ]}
    />
  );
}
