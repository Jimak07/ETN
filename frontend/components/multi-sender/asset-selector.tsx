"use client";

import { motion } from "framer-motion";
import { CircleCheck, Coins, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { useId } from "react";

import { GlassCard, SectionHeading } from "@/components/ui/glass-card";
import type { AssetKind, TokenState } from "@/hooks/use-multi-sender";
import { cn } from "@/lib/cn";
import { getPopularTokens, type ChainConfig } from "@/lib/chains";

/**
 * What is being sent, in three states.
 *
 * The split between "popular" and "custom" is not cosmetic. A listed token has
 * its symbol and, more importantly, its *decimals* known before the user clicks,
 * which is what makes it one click. An arbitrary contract has to be read from
 * the chain, and until that read lands every amount in the table is scaled by a
 * guess - so the custom tab says what it found, and says so loudly.
 *
 * The native tab hides the contract input entirely rather than showing a
 * disabled one: there is no address to give, and an empty address box invites
 * the user to go looking for one.
 */

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
      <p className="flex items-center gap-1.5 text-[0.68rem] text-slate-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Reading the contract...
      </p>
    );
  }

  if (token.error) {
    return (
      <p role="alert" className="flex items-start gap-1.5 text-[0.68rem] leading-relaxed text-status-offline">
        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
        {token.error}
      </p>
    );
  }

  if (!token.address) return null;

  // Check for symbol collision with known curated tokens on this chain (anti-phishing)
  const popular = getPopularTokens(chain.id);
  const impersonated = isCustom
    ? popular.find(
        (p) =>
          p.symbol.toLowerCase() === token.symbol.toLowerCase() &&
          p.address.toLowerCase() !== token.address?.toLowerCase(),
      )
    : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[0.68rem]">
        {isCustom ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-400">
            <ShieldAlert className="h-3 w-3" />
            Unverified: {token.symbol}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-status-healthy/30 bg-status-healthy/[0.07] px-2 py-0.5 text-status-healthy">
            <CircleCheck className="h-3 w-3" />
            {token.symbol}
          </span>
        )}
        <span className="num rounded-full border border-slate-800 bg-slate-900/60 px-2 py-0.5 text-slate-300">
          {token.decimals} decimals
        </span>
        <a
          href={`${chain.explorerUrl}/token/${token.address}`}
          target="_blank"
          rel="noreferrer noopener"
          className="num text-slate-500 transition hover:text-cyan-300"
        >
          {token.address.slice(0, 8)}...{token.address.slice(-6)}
        </a>
      </div>

      {impersonated ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-[0.68rem] text-amber-300"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <p className="font-semibold text-amber-200">Potential Token Impersonation Warning</p>
            <p className="mt-0.5 text-amber-300/90 leading-relaxed">
              This contract uses symbol &apos;{token.symbol}&apos;, but does not match the known {token.symbol} token
              contract ({impersonated.address.slice(0, 6)}...{impersonated.address.slice(-4)}). Anyone can deploy a
              token with any name. Verify the contract address before sending or approving funds.
            </p>
          </div>
        </div>
      ) : isCustom ? (
        <p className="text-[0.62rem] leading-relaxed text-slate-500">
          ⚠️ Custom tokens and collections are unverified. Please double-check the contract address on the block explorer to avoid
          interacting with counterfeit contracts.
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
    <GlassCard className="overflow-visible p-5">
      <SectionHeading
        title="Asset"
        subtitle="Native coin, ERC-20 token, or NFT collection"
        icon={<Coins className="h-4 w-4" />}
      />

      <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950/60 p-1 sm:grid-cols-4">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onAssetChange(option.value)}
            disabled={disabled}
            aria-pressed={asset === option.value}
            className={cn(
              "relative rounded-lg px-2 py-2 text-[0.7rem] font-medium transition disabled:opacity-60",
              asset === option.value ? "text-slate-950" : "text-slate-400 hover:text-slate-200",
            )}
          >
            {asset === option.value ? (
              <motion.span
                layoutId="asset-kind"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-lg bg-cyan-400"
              />
            ) : null}
            <span className="relative">{option.label}</span>
          </button>
        ))}
      </div>

      {asset === "native" ? (
        <p className="mt-3 text-[0.68rem] leading-relaxed text-slate-500">
          Sending <span className="text-slate-300">{name}</span> - the network&apos;s own coin, scaled to{" "}
          <span className="num text-slate-300">{chain.nativeCurrency.decimals}</span> decimals. No contract address is
          involved.
        </p>
      ) : null}

      {asset === "popular" ? (
        <div className="mt-3 space-y-2">
          {listed.length === 0 ? (
            <p className="rounded-xl border border-status-degraded/30 bg-status-degraded/[0.07] px-3 py-2.5 text-[0.68rem] leading-relaxed text-slate-300">
              No curated token list for <span className="text-slate-100">{chain.name}</span> yet, so nothing here would
              be safe to prefill.{" "}
              <button
                type="button"
                onClick={() => onAssetChange("custom")}
                className="font-medium text-cyan-300 underline decoration-cyan-500/40 underline-offset-2 transition hover:text-cyan-200"
              >
                Paste the contract address instead
              </button>
              .
            </p>
          ) : (
            <>
              <label
                htmlFor={selectId}
                className="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-slate-500"
              >
                Token
              </label>
              <select
                id={selectId}
                value={tokenAddress}
                onChange={(event) => onTokenAddressChange(event.target.value)}
                disabled={disabled}
                className={cn(
                  "num w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-xs text-slate-200",
                  "focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-60",
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
            className="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-slate-500"
          >
            Token contract
          </label>
          <input
            id={inputId}
            value={tokenAddress}
            onChange={(event) => onTokenAddressChange(event.target.value)}
            disabled={disabled}
            spellCheck={false}
            placeholder="0x..."
            className={cn(
              "num w-full rounded-xl border bg-slate-950/60 px-3 py-2.5 text-xs text-slate-200",
              "placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/20",
              token.error ? "border-status-offline/50" : "border-slate-800 focus:border-cyan-500/50",
              "disabled:opacity-60",
            )}
          />
          <TokenReadout token={token} chain={chain} isCustom={true} />
          {!token.address && !token.error && !token.loading ? (
            <p className="text-[0.68rem] leading-relaxed text-slate-500">
              Symbol and decimals are read from the contract itself, so a wrong address fails here instead of
              mis-scaling every amount in the batch.
            </p>
          ) : null}
        </div>
      ) : null}

      {asset === "nft" ? (
        <div className="mt-3 space-y-3">
          <div>
            <label
              htmlFor={inputId}
              className="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-slate-500"
            >
              NFT Contract Address
            </label>
            <input
              id={inputId}
              value={tokenAddress}
              onChange={(event) => onTokenAddressChange(event.target.value)}
              disabled={disabled}
              spellCheck={false}
              placeholder="0x..."
              className={cn(
                "num mt-1 w-full rounded-xl border bg-slate-950/60 px-3 py-2.5 text-xs text-slate-200",
                "placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500/20",
                token.error ? "border-status-offline/50" : "border-slate-800 focus:border-cyan-500/50",
                "disabled:opacity-60",
              )}
            />
          </div>

          <div>
            <span className="block text-[0.62rem] font-medium uppercase tracking-[0.16em] text-slate-500">
              NFT Standard
            </span>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950/40 p-1">
              <button
                type="button"
                onClick={() => onNftStandardChange?.("erc721")}
                disabled={disabled}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-medium transition",
                  nftStandard === "erc721"
                    ? "border border-cyan-500/40 bg-cyan-500/20 text-cyan-300"
                    : "text-slate-400 hover:text-slate-200",
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
                    : "text-slate-400 hover:text-slate-200",
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
    </GlassCard>
  );
}
