"use client";

import { ExternalLink, Image as ImageIcon, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { InfoTooltip, WEB3_GLOSSARY } from "@/components/ui/info-tooltip";
import type { NftHolding } from "@/lib/portfolio/types";

interface NftTabProps {
  nfts: NftHolding[];
  loading: boolean;
}

export function NftTab({ nfts, loading }: NftTabProps) {
  if (loading && nfts.length === 0) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 py-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="aspect-square w-full animate-pulse rounded-2xl bg-slate-900/60" />
        ))}
      </div>
    );
  }

  if (nfts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 p-12 text-center">
        <ImageIcon className="h-10 w-10 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-200">No NFTs Found in Wallet</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-sm">
          This address does not currently hold any ERC-721 or ERC-1155 digital collectibles on Electroneum.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          Showing <span className="font-semibold text-slate-200">{nfts.length}</span> collectible
          {nfts.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {nfts.map((nft) => (
          <NftCard key={`${nft.collectionAddress}-${nft.id}`} nft={nft} />
        ))}
      </div>
    </div>
  );
}

function NftCard({ nft }: { nft: NftHolding }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/50 p-3 transition-all duration-300 hover:border-cyan-500/40 hover:bg-slate-900/80 hover:shadow-glow">
      {/* Media Container */}
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950 flex items-center justify-center">
        {nft.imageUrl && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nft.imageUrl}
            alt={nft.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-slate-600">
            <ImageIcon className="h-8 w-8" />
            <span className="text-[0.62rem] font-mono">No Preview</span>
          </div>
        )}

        {/* Standard Badge */}
        <div className="absolute top-2 right-2">
          <InfoTooltip
            term={
              nft.standard === "ERC-1155"
                ? WEB3_GLOSSARY.erc1155.term
                : WEB3_GLOSSARY.erc721.term
            }
            definition={
              nft.standard === "ERC-1155"
                ? WEB3_GLOSSARY.erc1155.definition
                : WEB3_GLOSSARY.erc721.definition
            }
            showIcon
          >
            <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2 py-0.5 text-[0.6rem] font-mono text-cyan-300 backdrop-blur-md hover:border-cyan-400 transition cursor-help">
              {nft.standard}
            </span>
          </InfoTooltip>
        </div>
      </div>

      {/* Metadata Info */}
      <div className="mt-3 space-y-1">
        <p className="text-[0.65rem] font-mono uppercase tracking-wider text-slate-500 truncate">
          {nft.collectionName}
        </p>
        <p className="font-bold text-xs text-slate-100 truncate group-hover:text-cyan-200 transition">
          {nft.name}
        </p>
        <p className="font-mono text-[0.68rem] text-slate-400">
          ID: <span className="text-slate-300">#{nft.id}</span>
        </p>
      </div>

      {/* Action Toolbar */}
      <div className="mt-3.5 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[0.68rem]">
        <a
          href={nft.explorerUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition"
        >
          <span>Instance</span>
          <ExternalLink className="h-2.5 w-2.5" />
        </a>

        {/* Quick Batch Send via PulseDrop Shortcut */}
        <Link
          href={`/multi-sender`}
          title="Batch send this NFT via PulseDrop"
          className="flex items-center gap-1 font-semibold text-cyan-400 hover:text-cyan-300 transition"
        >
          <Send className="h-2.5 w-2.5" />
          <span>PulseDrop</span>
        </Link>
      </div>
    </div>
  );
}
