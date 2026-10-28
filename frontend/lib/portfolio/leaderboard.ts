import { formatUnits, getAddress, isAddress, type Address, type PublicClient } from "viem";

import { NATIVE_ETN_ADDRESS, WETN_ADDRESS } from "@/lib/constants/electroswap";
import { BLOCKSCOUT_API_BASE, FALLBACK_ETN_USD_PRICE } from "@/lib/constants/myverse";
import { ETN_MAINNET } from "@/lib/etn";
import { getReadClient } from "@/lib/multi-sender/contract";
import { fetchEtnUsdPrice, fetchTokenPriceInEtn } from "./pricing";

export interface LeaderboardToken {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
  iconUrl: string | null;
  holdersCount: number;
  totalSupply: string;
  totalSupplyFormatted: string;
  circulatingMarketCap: number | null;
  exchangeRate: number | null;
  priceInEtn: number;
  priceInUsd: number;
  isNative?: boolean;
}

export interface TokenHolderItem {
  rank: number;
  address: Address;
  label?: string;
  isContract: boolean;
  contractName?: string | null;
  balanceRaw: string;
  balanceFormatted: string;
  balanceNumber: number;
  supplySharePercent: number;
  valueUsd: number;
  valueEtn: number;
}

interface BlockscoutTokenApiItem {
  address?: string;
  circulating_market_cap?: string | number | null;
  decimals?: string | number | null;
  exchange_rate?: string | number | null;
  holders?: string | number | null;
  icon_url?: string | null;
  name?: string | null;
  symbol?: string | null;
  total_supply?: string | null;
  type?: string | null;
}

interface BlockscoutHolderApiItem {
  address?: {
    hash?: string;
    is_contract?: boolean;
    name?: string | null;
    ens_domain_name?: string | null;
  };
  value?: string;
  token?: {
    decimals?: string | null;
    total_supply?: string | null;
  };
}

interface BlockscoutAddressApiItem {
  hash?: string;
  coin_balance?: string | null;
  transaction_count?: string | number | null;
  is_contract?: boolean;
  name?: string | null;
  ens_domain_name?: string | null;
}

// In-memory cache for token list to prevent rate-limiting
let cachedTokens: { tokens: LeaderboardToken[]; timestamp: number } | null = null;
const TOKENS_CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Fetch Top 50 tokens on Electroneum Mainnet with Native ETN pinned at #1.
 */
export async function fetchTopEcosystemTokens(signal?: AbortSignal): Promise<LeaderboardToken[]> {
  const now = Date.now();
  if (cachedTokens && now - cachedTokens.timestamp < TOKENS_CACHE_TTL_MS) {
    return cachedTokens.tokens;
  }

  const etnUsdPrice = await fetchEtnUsdPrice(signal);
  const client = getReadClient(ETN_MAINNET.id);

  // 1. Construct Native ETN as Token #1
  const nativeEtnToken: LeaderboardToken = {
    address: NATIVE_ETN_ADDRESS,
    name: "Electroneum",
    symbol: "ETN",
    decimals: 18,
    iconUrl: "https://coin-images.coingecko.com/coins/images/1109/small/Electroneum2_profile_picture_transparent.png",
    holdersCount: 2211686,
    totalSupply: "21000000000000000000000000000",
    totalSupplyFormatted: "21,000,000,000",
    circulatingMarketCap: 38055362,
    exchangeRate: 1.0,
    priceInEtn: 1.0,
    priceInUsd: etnUsdPrice,
    isNative: true,
  };

  const tokensList: LeaderboardToken[] = [nativeEtnToken];

  try {
    const res = await fetch(`${BLOCKSCOUT_API_BASE}/tokens?type=ERC-20`, {
      signal,
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = (await res.json()) as { items?: BlockscoutTokenApiItem[] };
      const items = Array.isArray(data.items) ? data.items : [];

      for (const item of items) {
        if (!item.address || !isAddress(item.address)) continue;

        const checksum = getAddress(item.address);
        const decimals = Number(item.decimals ?? 18);
        const holders = Number(item.holders ?? 0);
        const rawSupply = item.total_supply ?? "0";

        let supplyFormatted = "—";
        try {
          if (rawSupply && rawSupply !== "0") {
            const num = Number(formatUnits(BigInt(rawSupply), decimals));
            supplyFormatted = Number(num.toFixed(2)).toLocaleString();
          }
        } catch {
          // Ignore formatting error
        }

        const exchangeRate = item.exchange_rate ? Number(item.exchange_rate) : null;
        const marketCap = item.circulating_market_cap ? Number(item.circulating_market_cap) : null;

        // Fetch or estimate price in ETN
        let priceInEtn = 0;
        if (checksum.toLowerCase() === WETN_ADDRESS.toLowerCase()) {
          priceInEtn = 1.0;
        } else if (client) {
          try {
            priceInEtn = await fetchTokenPriceInEtn(checksum, decimals, client);
          } catch {
            priceInEtn = exchangeRate ? exchangeRate / etnUsdPrice : 0;
          }
        }

        const priceInUsd = priceInEtn > 0 ? priceInEtn * etnUsdPrice : (exchangeRate ?? 0);

        tokensList.push({
          address: checksum,
          name: item.name || "Unknown Token",
          symbol: item.symbol || "ERC20",
          decimals,
          iconUrl: item.icon_url || null,
          holdersCount: holders,
          totalSupply: rawSupply,
          totalSupplyFormatted: supplyFormatted,
          circulatingMarketCap: marketCap,
          exchangeRate,
          priceInEtn,
          priceInUsd,
          isNative: false,
        });
      }
    }
  } catch (err) {
    console.error("Failed to fetch ecosystem tokens from Blockscout:", err);
  }

  cachedTokens = { tokens: tokensList, timestamp: now };
  return tokensList;
}

/**
 * Fetch Top Holders for a selected token (ERC-20 or Native ETN).
 */
export async function fetchTokenHolders(
  token: LeaderboardToken,
  etnUsdPrice: number,
  client?: PublicClient | null,
  signal?: AbortSignal
): Promise<TokenHolderItem[]> {
  // A. Native ETN Top Holders
  if (token.isNative) {
    try {
      const res = await fetch(`${BLOCKSCOUT_API_BASE}/addresses`, {
        signal,
        headers: { Accept: "application/json" },
      });

      if (res.ok) {
        const data = (await res.json()) as { items?: BlockscoutAddressApiItem[] };
        const items = Array.isArray(data.items) ? data.items : [];
        const holders: TokenHolderItem[] = [];

        // Total circulating / max supply of ETN is 21 billion
        const maxSupplyEtn = 21_000_000_000;

        items.forEach((item, index) => {
          if (!item.hash || !isAddress(item.hash)) return;

          const checksum = getAddress(item.hash);
          const rawBalance = item.coin_balance ? BigInt(item.coin_balance) : 0n;
          const balanceNum = Number(formatUnits(rawBalance, 18));
          const supplyShare = (balanceNum / maxSupplyEtn) * 100;
          const valueUsd = balanceNum * etnUsdPrice;

          holders.push({
            rank: index + 1,
            address: checksum,
            isContract: Boolean(item.is_contract),
            contractName: item.name || (item.is_contract ? "Smart Contract" : null),
            balanceRaw: rawBalance.toString(),
            balanceFormatted: Number(balanceNum.toFixed(2)).toLocaleString(),
            balanceNumber: balanceNum,
            supplySharePercent: Number(supplyShare.toFixed(3)),
            valueUsd: Number(valueUsd.toFixed(2)),
            valueEtn: Number(balanceNum.toFixed(2)),
          });
        });

        return holders;
      }
    } catch (err) {
      console.error("Failed to fetch native ETN holders:", err);
    }
    return [];
  }

  // B. ERC-20 Token Top Holders
  try {
    const res = await fetch(`${BLOCKSCOUT_API_BASE}/tokens/${token.address}/holders`, {
      signal,
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = (await res.json()) as { items?: BlockscoutHolderApiItem[] };
      const items = Array.isArray(data.items) ? data.items : [];
      const holders: TokenHolderItem[] = [];

      let rawTotalSupply = 0n;
      try {
        if (token.totalSupply && token.totalSupply !== "0") {
          rawTotalSupply = BigInt(token.totalSupply);
        }
      } catch {
        rawTotalSupply = 0n;
      }

      items.forEach((item, index) => {
        const addrHash = item.address?.hash;
        if (!addrHash || !isAddress(addrHash)) return;

        const checksum = getAddress(addrHash);
        const rawVal = item.value ? BigInt(item.value) : 0n;
        const balanceNum = Number(formatUnits(rawVal, token.decimals));

        let supplyShare = 0;
        if (rawTotalSupply > 0n) {
          supplyShare = Number((rawVal * 1000000n) / rawTotalSupply) / 10000;
        }

        const valueEtn = token.priceInEtn > 0 ? balanceNum * token.priceInEtn : 0;
        const valueUsd = token.priceInUsd > 0 ? balanceNum * token.priceInUsd : valueEtn * etnUsdPrice;

        holders.push({
          rank: index + 1,
          address: checksum,
          isContract: Boolean(item.address?.is_contract),
          contractName: item.address?.name || (item.address?.is_contract ? "Contract / Pool" : null),
          balanceRaw: rawVal.toString(),
          balanceFormatted: Number(balanceNum.toFixed(2)).toLocaleString(),
          balanceNumber: balanceNum,
          supplySharePercent: Number(supplyShare.toFixed(3)),
          valueUsd: Number(valueUsd.toFixed(2)),
          valueEtn: Number(valueEtn.toFixed(2)),
        });
      });

      return holders;
    }
  } catch (err) {
    console.error(`Failed to fetch holders for token ${token.address}:`, err);
  }

  return [];
}
