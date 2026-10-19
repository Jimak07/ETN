import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "Tip Studio — ETN Utility Hub",
  description: "Creator monetization and tipping widgets on Electroneum Smart Chain.",
};

export default function TipStudioPage() {
  return (
    <ModuleFallback
      title="Creator Tip Studio"
      category="Monetization"
      description="Empowering digital creators with non-custodial tipping widgets, micro-donations, and social payment links."
      iconKey="tip-studio"
      plannedFeatures={[
        "Embeddable tipping widgets for Web3 websites and social feeds",
        "Streamer overlay alerts and automated tip animations",
        "Direct peer-to-peer ETN micro-payments with zero platform fees",
      ]}
    />
  );
}
