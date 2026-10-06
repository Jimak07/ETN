"use client";

import { motion } from "framer-motion";
import { CircleCheck, Coins, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { useId } from "react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AssetKind, TokenState } from "@/hooks/use-multi-sender";
import { cn } from "@/lib/cn";
import { getPopularTokens, type ChainConfig } from "@/lib/chains";

interface AssetSelectorProps {
  asset: AssetKind;
  onAssetChange: (asset: AssetKind) => void;
  chain: ChainConfig;
  tokenAddress: string;
  onTokenAddressChange: (value: string) => void;
  token: TokenState;
  disabled?: boolean;
  nftStandard?: "erc721" | "erc1155";
  onNftStandardChange?: (standard: "erc721" | "erc1155") => void;
}

const OPTIONS: readonly { value: AssetKind; label: string }[] = [
  { value: "native", label: "Native coin" },
  { value: "popular", label: "Popular tokens" },
  { value: "custom", label: "Custom token" },
  { value: "nft", label: "NFTs (ERC-721 / 1155)" },
];

/** What the chain read produced: loading, a failure, or the resolved token. */
function TokenReadout({
  token,
  chain,
  isCustom = false,
}: {
  token: TokenState;
  chain: ChainConfig;
  isCustom?: boolean;
}) {
  if (token.loading) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
        Reading contract metadata from chain...
      </p>
    );
  }

  if (token.error) {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-xs leading-relaxed text-rose-400">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {token.error}
      </p>
    );
  }

  if (!token.address) return null;

  const popular = getPopularTokens(chain.id);
  const impersonated = isCustom
    ? popular.find(
        (p) =>
          p.symbol.toLowerCase() === token.symbol.toLowerCase() &&
          p.address.toLowerCase() !== token.address?.toLowerCase(),
      )
    : null;

  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {isCustom ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/30 px-2.5 py-0.5 text-amber-300 font-medium">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
            Unverified: {token.symbol}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-950/30 px-2.5 py-0.5 text-emerald-300 font-medium">
            <CircleCheck className="h-3.5 w-3.5 text-emerald-400" />
            {token.symbol}
          </span>
        )}
        <span className="font-mono rounded-full border border-slate-800 bg-slate-950/80 px-2.5 py-0.5 text-slate-300">
          {token.decimals} decimals
        </span>
        <a
          href={`${chain.explorerUrl}/token/${token.address}`}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono text-slate-400 transition hover:text-cyan-300 underline underline-offset-2"
        >
          {token.address.slice(0, 8)}...{token.address.slice(-6)}
        </a>
      </div>

      {impersonated ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-2.5 text-xs text-amber-200"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-amber-300">Potential Token Impersonation Warning</p>
            <p className="mt-0.5 leading-relaxed text-amber-300/90 text-[0.68rem]">
              This contract uses symbol &apos;{token.symbol}&apos;, but does not match the known {token.symbol} token
              contract ({impersonated.address.slice(0, 6)}...{impersonated.address.slice(-4)}). Verify before sending.
            </p>
          </div>
        </div>
      ) : isCustom ? (
        <p className="text-[0.68rem] leading-relaxed text-slate-500">
          ⚠️ Custom tokens and collections are unverified. Please double-check the contract address on the block explorer to avoid interacting with fake contracts.
        </p>
      ) : null}
    </div>
  );
}

export function AssetSelector({
  asset,
  onAssetChange,
  chain,
  tokenAddress,
  onTokenAddressChange,
  token,
  disabled = false,
  nftStandard = "erc721",
  onNftStandardChange,
}: AssetSelectorProps) {
  const selectId = useId();
  const inputId = useId();
  const listed = getPopularTokens(chain.id);
  const { name } = chain.nativeCurrency;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800/80">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/80 text-cyan-400">
          <Coins className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-slate-100">
            Asset Selection
          </h2>
          <p className="text-[0.68rem] text-slate-400">
            Native coin, popular verified tokens, custom ERC-20, or NFT collections
          </p>
        </div>
      </div>

      {/* 4-way Toggle */}
      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950/80 p-1 sm:grid-cols-4">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onAssetChange(option.value)}
            disabled={disabled}
            aria-pressed={asset === option.value}
            className={cn(
              "relative rounded-lg px-2.5 py-2 text-xs font-medium transition disabled:opacity-50 select-none",
              asset === option.value ? "text-slate-950 font-semibold" : "text-slate-400 hover:text-slate-200"
            )}
          >
            {asset === option.value ? (
              <motion.span
                layoutId="asset-kind"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg bg-cyan-400 shadow-glow"
              />
            ) : null}
            <span className="relative z-10">{option.label}</span>
          </button>
        ))}
      </div>

      {asset === "native" ? (
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          Sending <span className="font-semibold text-slate-200">{name}</span> (the network&apos;s native currency), scaled to{" "}
          <span className="font-mono text-cyan-300">{chain.nativeCurrency.decimals}</span> decimals. No contract allowance required.
        </p>
      ) : null}

      {asset === "popular" ? (
        <div className="mt-3 space-y-2">
          {listed.length === 0 ? (
            <p className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-3 py-2.5 text-xs leading-relaxed text-amber-200">
              No curated token list for <span className="font-semibold text-slate-100">{chain.name}</span> yet.{" "}
              <button
                type="button"
                onClick={() => onAssetChange("custom")}
                className="font-semibold text-cyan-300 underline decoration-cyan-500/40 underline-offset-2 hover:text-cyan-200"
              >
                Paste the contract address instead
              </button>
              .
            </p>
          ) : (
            <>
              <label
                htmlFor={selectId}
                className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-400"
              >
                Select Verified Token
              </label>
              <select
                id={selectId}
                value={tokenAddress}
                onChange={(event) => onTokenAddressChange(event.target.value)}
                disabled={disabled}
                className={cn(
                  "font-mono w-full rounded-xl border border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-slate-200",
                  "focus:border-cyan-500/60 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-50"
                )}
              >
                <option value="">Select a token...</option>
                {listed.map((option) => (
                  <option key={option.address} value={option.address}>
                    {option.symbol} - {option.decimals} decimals
                  </option>
                ))}
              </select>
              <TokenReadout token={token} chain={chain} />
            </>
          )}
        </div>
      ) : null}

      {asset === "custom" ? (
        <div className="mt-3 space-y-2">
          <label
            htmlFor={inputId}
            className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-400"
          >
            Token Contract Address
          </label>
          <Input
            id={inputId}
            value={tokenAddress}
            onChange={(event) => onTokenAddressChange(event.target.value)}
            disabled={disabled}
            spellCheck={false}
            placeholder="0x..."
            error={Boolean(token.error)}
            className="font-mono text-xs"
          />
          <TokenReadout token={token} chain={chain} isCustom={true} />
          {!token.address && !token.error && !token.loading ? (
            <p className="text-[0.68rem] leading-relaxed text-slate-500">
              Symbol and decimals will be fetched automatically from the contract.
            </p>
          ) : null}
        </div>
      ) : null}

      {asset === "nft" ? (
        <div className="mt-3 space-y-3">
          <div>
            <label
              htmlFor={inputId}
              className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-400"
            >
              NFT Contract Address
            </label>
            <Input
              id={inputId}
              value={tokenAddress}
              onChange={(event) => onTokenAddressChange(event.target.value)}
              disabled={disabled}
              spellCheck={false}
              placeholder="0x..."
              error={Boolean(token.error)}
              className="font-mono text-xs mt-1"
            />
          </div>

          <div>
            <span className="block text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
              NFT Standard
            </span>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1">
              <button
                type="button"
                onClick={() => onNftStandardChange?.("erc721")}
                disabled={disabled}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                  nftStandard === "erc721"
                    ? "border border-cyan-500/40 bg-cyan-500/20 text-cyan-300"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                ERC-721 (Unique NFTs)
              </button>
              <button
                type="button"
                onClick={() => onNftStandardChange?.("erc1155")}
                disabled={disabled}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                  nftStandard === "erc1155"
                    ? "border border-cyan-500/40 bg-cyan-500/20 text-cyan-300"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                ERC-1155 (Multi-Token Editions)
              </button>
            </div>
          </div>

          <TokenReadout token={token} chain={chain} isCustom={true} />

          <p className="text-[0.68rem] leading-relaxed text-slate-500">
            {nftStandard === "erc721"
              ? "ERC-721 mode: Specify recipient addresses and distinct Token IDs in the table below."
              : "ERC-1155 mode: Enter the global Token ID above the table and set edition quantities per recipient."}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
