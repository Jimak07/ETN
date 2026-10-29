import {
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  type Address,
  type PublicClient,
} from "viem";

import {
  ELECTROSWAP_V2_FACTORY_ADDRESS,
  NATIVE_ETN_ADDRESS,
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  WETN_ADDRESS,
} from "@/lib/constants/electroswap";
import {
  BLOCKSCOUT_API_BASE,
  FALLBACK_ETN_USD_PRICE,
} from "@/lib/constants/myverse";
import { ETN_MAINNET } from "@/lib/etn";
import { getReadClient } from "@/lib/multi-sender/contract";
import { fetchEtnUsdPrice, fetchTokenPriceInEtn } from "./pricing";

export type LeaderboardSortMode = "market-cap" | "holders" | "liquidity";

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
  liquidityDepthUsd?: number;
  marketCapUsd?: number;
  isNative?: boolean;
  rank?: number;
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

interface BlockscoutTokenDetailResponse {
  address?: string;
  circulating_market_cap?: string | number | null;
  decimals?: string | number | null;
  exchange_rate?: string | number | null;
  holders?: string | number | null;
  holders_count?: string | number | null;
  icon_url?: string | null;
  name?: string | null;
  symbol?: string | null;
  total_supply?: string | null;
  type?: string | null;
}

/**
 * Fetch Top 50 tokens on Electroneum Mainnet via Server API route
 * with fallback to client-side reconstruction if server route is unreachable.
 */
export async function fetchTopEcosystemTokens(
  sortMode: LeaderboardSortMode = "market-cap",
  refresh = false,
  signal?: AbortSignal
): Promise<LeaderboardToken[]> {
  try {
    const url = `/api/leaderboard/tokens?sort=${sortMode}${refresh ? "&refresh=true" : ""}`;
    const res = await fetch(url, {
      signal,
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const data = (await res.json()) as {
        success: boolean;
        tokens: LeaderboardToken[];
      };
      if (data?.success && Array.isArray(data.tokens) && data.tokens.length > 0) {
        return data.tokens;
      }
    }
  } catch (err) {
    console.warn("Server-side token leaderboard API call failed, using client fallback:", err);
  }

  // Fallback client-side baseline
  const etnUsdPrice = await fetchEtnUsdPrice(signal);
  const nativeEtnToken: LeaderboardToken = {
    address: NATIVE_ETN_ADDRESS,
    name: "Electroneum",
    symbol: "ETN",
    decimals: 18,
    iconUrl: "https://coin-images.coingecko.com/coins/images/1109/small/Electroneum2_profile_picture_transparent.png",
    holdersCount: 2214740,
    totalSupply: "21000000000000000000000000000",
    totalSupplyFormatted: "21,000,000,000",
    circulatingMarketCap: 21_000_000_000 * etnUsdPrice,
    exchangeRate: 1.0,
    priceInEtn: 1.0,
    priceInUsd: etnUsdPrice,
    liquidityDepthUsd: 21_000_000_000 * etnUsdPrice * 0.1,
    marketCapUsd: 21_000_000_000 * etnUsdPrice,
    isNative: true,
    rank: 1,
  };

  return [nativeEtnToken];
}

/**
 * Fetch a single custom ERC-20 token by 0x address.
 * Combines Blockscout token metadata with live on-chain pair reserves.
 */
export async function fetchCustomTokenByAddress(
  address: Address,
  etnUsdPrice: number,
  client?: PublicClient | null,
  signal?: AbortSignal
): Promise<LeaderboardToken | null> {
  if (!isAddress(address, { strict: false })) return null;
  const checksum = getAddress(address);

  // If Native ETN requested
  if (checksum.toLowerCase() === NATIVE_ETN_ADDRESS.toLowerCase()) {
    return {
      address: NATIVE_ETN_ADDRESS,
      name: "Electroneum",
      symbol: "ETN",
      decimals: 18,
      iconUrl: "https://coin-images.coingecko.com/coins/images/1109/small/Electroneum2_profile_picture_transparent.png",
      holdersCount: 2214740,
      totalSupply: "21000000000000000000000000000",
      totalSupplyFormatted: "21,000,000,000",
      circulatingMarketCap: 21_000_000_000 * etnUsdPrice,
      exchangeRate: 1.0,
      priceInEtn: 1.0,
      priceInUsd: etnUsdPrice,
      liquidityDepthUsd: 21_000_000_000 * etnUsdPrice * 0.1,
      marketCapUsd: 21_000_000_000 * etnUsdPrice,
      isNative: true,
      rank: 1,
    };
  }

  const readClient = client ?? getReadClient(ETN_MAINNET.id);

  let tokenName = "Unknown Token";
  let tokenSymbol = "ERC20";
  let tokenDecimals = 18;
  let rawSupply = "0";
  let holdersCount = 0;
  let iconUrl: string | null = null;

  // 1. Try querying Blockscout for token details
  try {
    const res = await fetch(`${BLOCKSCOUT_API_BASE}/tokens/${checksum}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as BlockscoutTokenDetailResponse;
      if (data) {
        if (data.name) tokenName = data.name;
        if (data.symbol) tokenSymbol = data.symbol;
        if (data.decimals !== undefined && data.decimals !== null) {
          tokenDecimals = Number(data.decimals);
        }
        if (data.total_supply) rawSupply = data.total_supply;
        if (data.holders_count ?? data.holders) {
          holdersCount = Number(data.holders_count ?? data.holders);
        }
        if (data.icon_url) iconUrl = data.icon_url;
      }
    }
  } catch {
    // Ignore and fallback to RPC
  }

  // 2. Fallback to reading contract if name/symbol/supply missing
  if (readClient && (tokenName === "Unknown Token" || rawSupply === "0")) {
    try {
      const [nameRes, symbolRes, decimalsRes, supplyRes] = await Promise.allSettled([
        readClient.readContract({
          address: checksum,
          abi: erc20Abi,
          functionName: "name",
        }),
        readClient.readContract({
          address: checksum,
          abi: erc20Abi,
          functionName: "symbol",
        }),
        readClient.readContract({
          address: checksum,
          abi: erc20Abi,
          functionName: "decimals",
        }),
        readClient.readContract({
          address: checksum,
          abi: erc20Abi,
          functionName: "totalSupply",
        }),
      ]);

      if (nameRes.status === "fulfilled" && typeof nameRes.value === "string") {
        tokenName = nameRes.value;
      }
      if (symbolRes.status === "fulfilled" && typeof symbolRes.value === "string") {
        tokenSymbol = symbolRes.value;
      }
      if (decimalsRes.status === "fulfilled" && typeof decimalsRes.value === "number") {
        tokenDecimals = decimalsRes.value;
      }
      if (supplyRes.status === "fulfilled" && typeof supplyRes.value === "bigint") {
        rawSupply = supplyRes.value.toString();
      }
    } catch {
      // Contract reading failed
    }
  }

  // Format Total Supply
  let supplyFormatted = "—";
  let supplyNum = 0;
  try {
    if (rawSupply && rawSupply !== "0") {
      supplyNum = Number(formatUnits(BigInt(rawSupply), tokenDecimals));
      supplyFormatted = Number(supplyNum.toFixed(2)).toLocaleString();
    }
  } catch {
    // Ignore
  }

  // 3. Resolve Live Pricing & Reserves
  let priceInEtn = 0;
  let priceInUsd = 0;
  let liquidityDepthUsd = 0;
  let marketCapUsd = 0;

  if (checksum.toLowerCase() === WETN_ADDRESS.toLowerCase()) {
    priceInEtn = 1.0;
    priceInUsd = etnUsdPrice;
    marketCapUsd = supplyNum * etnUsdPrice;
    liquidityDepthUsd = marketCapUsd * 0.5;
  } else if (readClient) {
    try {
      const pairAddress = (await readClient.readContract({
        address: ELECTROSWAP_V2_FACTORY_ADDRESS,
        abi: UNISWAP_V2_FACTORY_ABI,
        functionName: "getPair",
        args: [checksum, WETN_ADDRESS],
      })) as Address;

      if (
        pairAddress &&
        pairAddress !== "0x0000000000000000000000000000000000000000"
      ) {
        const [token0, reserves] = (await Promise.all([
          readClient.readContract({
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "token0",
          }),
          readClient.readContract({
            address: pairAddress,
            abi: UNISWAP_V2_PAIR_ABI,
            functionName: "getReserves",
          }),
        ])) as [Address, [bigint, bigint, number]];

        const isToken0 = token0.toLowerCase() === checksum.toLowerCase();
        const reserveTokenRaw = isToken0 ? reserves[0] : reserves[1];
        const reserveWetnRaw = isToken0 ? reserves[1] : reserves[0];

        if (reserveTokenRaw > 0n && reserveWetnRaw > 0n) {
          const tokenAmount = Number(formatUnits(reserveTokenRaw, tokenDecimals));
          const wetnAmount = Number(formatUnits(reserveWetnRaw, 18));

          if (tokenAmount > 0) {
            priceInEtn = wetnAmount / tokenAmount;
            priceInUsd = priceInEtn * etnUsdPrice;
            liquidityDepthUsd = wetnAmount * 2 * etnUsdPrice;
            marketCapUsd = supplyNum * priceInUsd;
          }
        }
      }
    } catch {
      // Pricing lookup error
    }
  }

  return {
    address: checksum,
    name: tokenName,
    symbol: tokenSymbol,
    decimals: tokenDecimals,
    iconUrl,
    holdersCount,
    totalSupply: rawSupply,
    totalSupplyFormatted: supplyFormatted,
    circulatingMarketCap: marketCapUsd > 0 ? marketCapUsd : null,
    exchangeRate: priceInUsd > 0 ? priceInUsd : null,
    priceInEtn,
    priceInUsd,
    liquidityDepthUsd,
    marketCapUsd,
    isNative: false,
  };
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
          if (!item.hash || !isAddress(item.hash, { strict: false })) return;

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
        if (!addrHash || !isAddress(addrHash, { strict: false })) return;

        const checksum = getAddress(addrHash);
        const rawVal = item.value ? BigInt(item.value) : 0n;
        const balanceNum = Number(formatUnits(rawVal, token.decimals));

        let supplyShare = 0;
        if (rawTotalSupply > 0n) {
          supplyShare = Number((rawVal * 1000000n) / rawTotalSupply) / 10000;
        }

        const valueEtn = token.priceInEtn > 0 ? balanceNum * token.priceInEtn : 0;
        const valueUsd =
          token.priceInUsd > 0
            ? balanceNum * token.priceInUsd
            : valueEtn * etnUsdPrice;

        holders.push({
          rank: index + 1,
          address: checksum,
          isContract: Boolean(item.address?.is_contract),
          contractName:
            item.address?.name || (item.address?.is_contract ? "Contract / Pool" : null),
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
