import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "PulseSwap — ETNVerse Hub",
  description:
    "Automated Decentralized Token Exchange routed via ElectroSwap V2 Smart Contracts on Electroneum Smart Chain.",
  openGraph: {
    title: "PulseSwap — ETNVerse Hub",
    description:
      "Automated Decentralized Token Exchange routed via ElectroSwap V2 Smart Contracts on Electroneum Smart Chain.",
  },
};

export default function SwapLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
