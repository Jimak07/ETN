import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "PulseDrop — ETNVerse Hub",
  description:
    "Mass Token & NFT Distribution Engine on Electroneum Smart Chain. Non-custodial, batch-optimized execution.",
  openGraph: {
    title: "PulseDrop — ETNVerse Hub",
    description:
      "Mass Token & NFT Distribution Engine on Electroneum Smart Chain. Non-custodial, batch-optimized execution.",
  },
};

export default function MultiSenderLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
