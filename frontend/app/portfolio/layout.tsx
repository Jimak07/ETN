import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "MyVerse — Personal Portfolio & Address Intelligence | ETNVerse Hub",
  description:
    "Personal Portfolio, Whale Tracker & DeFi Intelligence on the Electroneum Smart Chain (ETN-SC). Real-time token balances, ElectroSwap V2 LP positions, NFT gallery, and gas telemetry.",
  openGraph: {
    title: "MyVerse — Personal Portfolio & Address Intelligence | ETNVerse Hub",
    description:
      "Personal Portfolio, Whale Tracker & DeFi Intelligence on the Electroneum Smart Chain (ETN-SC). Real-time token balances, ElectroSwap V2 LP positions, NFT gallery, and gas telemetry.",
  },
};

export default function PortfolioLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
