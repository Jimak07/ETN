import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "PulseStake — ETNVerse Hub",
  description: "Validator Yields & Delegation Tracker on Electroneum Smart Chain.",
};

export default function StakePage() {
  return (
    <ModuleFallback
      title="PulseStake"
      category="Validator Yields"
      description="Validator Yields & Delegation Tracker with consensus telemetry & APY calculator."
      iconKey="stake"
      plannedFeatures={[
        "Real-time validator uptime & performance telemetry",
        "Direct non-custodial delegation interfaces",
        "Compound yield & reward distribution calculators",
      ]}
    />
  );
}
