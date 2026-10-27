import type { Metadata } from "next";

import { ModuleFallback } from "@/components/module-fallback";

export const metadata: Metadata = {
  title: "PulseTip — ETNVerse Hub",
  description: "Web3 Creator Micro-Tipping & Patronage with direct peer-to-peer ETN streams.",
};

export default function TipStudioPage() {
  return (
    <ModuleFallback
      title="PulseTip"
      category="Creator Monetization"
      description="Web3 Creator Micro-Tipping & Patronage — empowering digital creators with non-custodial tipping widgets and direct peer-to-peer ETN streams."
      iconKey="tip-studio"
      plannedFeatures={[
        "Embeddable tipping widgets for Web3 websites and social feeds",
        "Streamer overlay alerts and automated tip animations",
        "Direct peer-to-peer ETN micro-payments with zero platform fees",
      ]}
    />
  );
}
