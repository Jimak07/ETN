import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "Stake — ETN Utility Hub",
  description: "Track validator yields and delegation rewards on Electroneum Smart Chain.",
};

export default function StakePage() {
  return (
    <ModuleFallback
      title="Validator Staking"
      category="Consensus & Yields"
      description="Track network consensus validators, monitor annual percentage yields (APY), and delegate ETN securely."
      iconKey="stake"
      plannedFeatures={[
        "Real-time validator uptime & performance telemetry",
        "Direct non-custodial delegation interfaces",
        "Compound yield & reward distribution calculators",
      ]}
    />
  );
}
