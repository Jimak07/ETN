import { NextResponse, type NextRequest } from "next/server";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  type Address,
} from "viem";

import { POPULAR_TOKENS } from "@/lib/chains";
import {
  DEFAULT_ECOSYSTEM_TOKENS,
  ELECTROSWAP_V2_FACTORY_ADDRESS,
  NATIVE_ETN_ADDRESS,
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  WETN_ADDRESS,
} from "@/lib/constants/electroswap";
import {
  BLOCKSCOUT_API_BASE,
  BLOCKSCOUT_STATS_URL,
  FALLBACK_ETN_USD_PRICE,
} from "@/lib/constants/myverse";
import { ETN_MAINNET } from "@/lib/etn";
import type { LeaderboardToken } from "@/lib/portfolio/leaderboard";

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface BlockscoutTokenApiItem {
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

interface BlockscoutStatsResponse {
  coin_price?: string | number | null;
  coin_image?: string | null;
  market_cap?: string | number | null;
  total_addresses?: string | number | null;
}

// In-memory server cache
let cachedData: {
  rawTokens: LeaderboardToken[];
  timestamp: number;
} | null = null;
const CACHE_TTL_MS = 60_000; // 60 seconds

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchEtnUsdPriceAndStats(): Promise<{
  etnPriceUsd: number;
  totalAddresses: number;
  coinImage: string;
  marketCap: number;
}> {
  let etnPriceUsd = FALLBACK_ETN_USD_PRICE;
  let totalAddresses = 2214740;
  let coinImage =
    "https://coin-images.coingecko.com/coins/images/1109/small/Electroneum2_profile_picture_transparent.png";
  let marketCap = 21_000_000_000 * FALLBACK_ETN_USD_PRICE;

  try {
    const res = await fetch(BLOCKSCOUT_STATS_URL, {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = (await res.json()) as BlockscoutStatsResponse;
      if (data.coin_price) {
        const parsedPrice = Number(data.coin_price);
        if (!Number.isNaN(parsedPrice) && parsedPrice > 0) {
          etnPriceUsd = parsedPrice;
        }
      }
      if (data.total_addresses) {
        const parsedAddresses = Number(data.total_addresses);
        if (!Number.isNaN(parsedAddresses) && parsedAddresses > 0) {
          totalAddresses = parsedAddresses;
        }
      }
      if (data.coin_image) {
        coinImage = data.coin_image;
      }
      if (data.market_cap) {
        const parsedMcap = Number(data.market_cap);
        if (!Number.isNaN(parsedMcap) && parsedMcap > 0) {
          marketCap = parsedMcap;
        }
      }
    }
  } catch {
    // Attempt CoinGecko fallback for price
    try {
      const cgRes = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=electroneum&vs_currencies=usd",
        { headers: { Accept: "application/json" }, next: { revalidate: 60 } }
      );
      if (cgRes.ok) {
        const cgData = (await cgRes.json()) as { electroneum?: { usd?: number } };
        const usd = cgData?.electroneum?.usd;
        if (typeof usd === "number" && usd > 0) {
          etnPriceUsd = usd;
          marketCap = 21_000_000_000 * usd;
        }
      }
    } catch {
      // Ignore
    }
  }

  return { etnPriceUsd, totalAddresses, coinImage, marketCap };
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sortParam = (searchParams.get("sort") || "market-cap").toLowerCase();
    const isRefresh = searchParams.get("refresh") === "true";

    const now = Date.now();

    // 1. Check in-memory cache if not forced refresh
    if (!isRefresh && cachedData && now - cachedData.timestamp < CACHE_TTL_MS) {
      const sorted = sortTokens(cachedData.rawTokens, sortParam);
      return NextResponse.json({
        success: true,
        count: sorted.length,
        tokens: sorted,
        updatedAt: cachedData.timestamp,
        cached: true,
      });
    }

    // 2. Fetch stats & price
    const { etnPriceUsd, totalAddresses, coinImage, marketCap } =
      await fetchEtnUsdPriceAndStats();

    // 3. Construct Native ETN (Token #1)
    const nativeEtnToken: LeaderboardToken = {
      address: NATIVE_ETN_ADDRESS,
      name: "Electroneum",
      symbol: "ETN",
      decimals: 18,
      iconUrl: coinImage,
      holdersCount: totalAddresses,
      totalSupply: "21000000000000000000000000000",
      totalSupplyFormatted: "21,000,000,000",
      circulatingMarketCap: marketCap,
      exchangeRate: 1.0,
      priceInEtn: 1.0,
      priceInUsd: etnPriceUsd,
      liquidityDepthUsd: marketCap * 0.1,
      marketCapUsd: marketCap,
      isNative: true,
      rank: 1,
    };

    // 4. Fetch Candidate ERC-20 tokens from Blockscout
    const candidateMap = new Map<
      string,
      {
        address: Address;
        name: string;
        symbol: string;
        decimals: number;
        iconUrl: string | null;
        holdersCount: number;
        totalSupply: string;
        totalSupplyFormatted: string;
      }
    >();

    try {
      const res = await fetch(`${BLOCKSCOUT_API_BASE}/tokens?type=ERC-20`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 },
      });
      if (res.ok) {
        const data = (await res.json()) as { items?: BlockscoutTokenApiItem[] };
        const items = Array.isArray(data.items) ? data.items : [];
        for (const item of items) {
          if (!item.address || !isAddress(item.address, { strict: false })) continue;
          const checksum = getAddress(item.address);
          if (checksum.toLowerCase() === NATIVE_ETN_ADDRESS.toLowerCase()) continue;

          const decimals = Number(item.decimals ?? 18);
          const rawHolders = item.holders_count ?? item.holders ?? 0;
          const holdersCount = Number(rawHolders) || 0;
          const rawSupply = item.total_supply ?? "0";

          let supplyFormatted = "—";
          try {
            if (rawSupply && rawSupply !== "0") {
              const num = Number(formatUnits(BigInt(rawSupply), decimals));
              supplyFormatted = Number(num.toFixed(2)).toLocaleString();
            }
          } catch {
            // fallback
          }

          candidateMap.set(checksum.toLowerCase(), {
            address: checksum,
            name: item.name || "Unknown Token",
            symbol: item.symbol || "ERC20",
            decimals,
            iconUrl: item.icon_url || null,
            holdersCount,
            totalSupply: rawSupply,
            totalSupplyFormatted: supplyFormatted,
          });
        }
      }
    } catch (err) {
      console.error("Blockscout tokens fetch error:", err);
    }

    // 5. Merge Curated and Popular Tokens if missing
    const curatedTokens = [
      ...DEFAULT_ECOSYSTEM_TOKENS.filter((t) => !t.isNative),
      ...(POPULAR_TOKENS[ETN_MAINNET.id] || []),
    ];

    for (const token of curatedTokens) {
      if (!isAddress(token.address, { strict: false })) continue;
      const checksum = getAddress(token.address);
      if (checksum.toLowerCase() === NATIVE_ETN_ADDRESS.toLowerCase()) continue;
      const key = checksum.toLowerCase();

      if (!candidateMap.has(key)) {
        candidateMap.set(key, {
          address: checksum,
          name: "name" in token ? (token.name as string) : token.symbol,
          symbol: token.symbol,
          decimals: token.decimals,
          iconUrl: "iconUrl" in token ? (token.iconUrl as string | null) : null,
          holdersCount: 100, // baseline estimate until synced
          totalSupply: "0",
          totalSupplyFormatted: "—",
        });
      }
    }

    // 6. Enrich Candidate Tokens with Live ElectroSwap V2 Pair Reserves
    const candidates = Array.from(candidateMap.values());
    const publicClient = createPublicClient({
      transport: http(ETN_MAINNET.rpcUrls[0], { timeout: 10_000 }),
    });

    const enrichedErc20Tokens: LeaderboardToken[] = [];
    const chunks = chunkArray(candidates, 10);

    for (const chunk of chunks) {
      const pairResults = await Promise.allSettled(
        chunk.map(async (token) => {
          const lower = token.address.toLowerCase();

          // Handle WETN directly
          if (lower === WETN_ADDRESS.toLowerCase()) {
            let mcapUsd = 0;
            try {
              if (token.totalSupply && token.totalSupply !== "0") {
                const supplyNum = Number(formatUnits(BigInt(token.totalSupply), token.decimals));
                mcapUsd = supplyNum * etnPriceUsd;
              }
            } catch {
              // ignore
            }
            return {
              ...token,
              circulatingMarketCap: mcapUsd,
              exchangeRate: 1.0,
              priceInEtn: 1.0,
              priceInUsd: etnPriceUsd,
              liquidityDepthUsd: mcapUsd * 0.5,
              marketCapUsd: mcapUsd,
              isNative: false,
            };
          }

          // Query Pair Address from ElectroSwap Factory
          const pairAddress = (await publicClient.readContract({
            address: ELECTROSWAP_V2_FACTORY_ADDRESS,
            abi: UNISWAP_V2_FACTORY_ABI,
            functionName: "getPair",
            args: [token.address, WETN_ADDRESS],
          })) as Address;

          if (
            !pairAddress ||
            pairAddress === "0x0000000000000000000000000000000000000000"
          ) {
            return {
              ...token,
              circulatingMarketCap: null,
              exchangeRate: null,
              priceInEtn: 0,
              priceInUsd: 0,
              liquidityDepthUsd: 0,
              marketCapUsd: 0,
              isNative: false,
            };
          }

          // Query Pair Reserves
          const [token0, reserves] = (await Promise.all([
            publicClient.readContract({
              address: pairAddress,
              abi: UNISWAP_V2_PAIR_ABI,
              functionName: "token0",
            }),
            publicClient.readContract({
              address: pairAddress,
              abi: UNISWAP_V2_PAIR_ABI,
              functionName: "getReserves",
            }),
          ])) as [Address, [bigint, bigint, number]];

          const isToken0 = token0.toLowerCase() === lower;
          const reserveTokenRaw = isToken0 ? reserves[0] : reserves[1];
          const reserveWetnRaw = isToken0 ? reserves[1] : reserves[0];

          if (reserveTokenRaw <= 0n || reserveWetnRaw <= 0n) {
            return {
              ...token,
              circulatingMarketCap: null,
              exchangeRate: null,
              priceInEtn: 0,
              priceInUsd: 0,
              liquidityDepthUsd: 0,
              marketCapUsd: 0,
              isNative: false,
            };
          }

          const tokenAmount = Number(formatUnits(reserveTokenRaw, token.decimals));
          const wetnAmount = Number(formatUnits(reserveWetnRaw, 18));

          if (tokenAmount <= 0) {
            return {
              ...token,
              circulatingMarketCap: null,
              exchangeRate: null,
              priceInEtn: 0,
              priceInUsd: 0,
              liquidityDepthUsd: 0,
              marketCapUsd: 0,
              isNative: false,
            };
          }

          const priceInEtn = wetnAmount / tokenAmount;
          const priceInUsd = priceInEtn * etnPriceUsd;
          const liquidityDepthUsd = wetnAmount * 2 * etnPriceUsd;

          let marketCapUsd = 0;
          try {
            if (token.totalSupply && token.totalSupply !== "0") {
              const supplyNum = Number(formatUnits(BigInt(token.totalSupply), token.decimals));
              marketCapUsd = supplyNum * priceInUsd;
            }
          } catch {
            // ignore
          }

          return {
            ...token,
            circulatingMarketCap: marketCapUsd > 0 ? marketCapUsd : null,
            exchangeRate: priceInUsd,
            priceInEtn,
            priceInUsd,
            liquidityDepthUsd,
            marketCapUsd,
            isNative: false,
          };
        })
      );

      for (const res of pairResults) {
        if (res.status === "fulfilled" && res.value) {
          enrichedErc20Tokens.push(res.value);
        }
      }
    }

    const allTokens = [nativeEtnToken, ...enrichedErc20Tokens];

    // Save to server cache
    cachedData = {
      rawTokens: allTokens,
      timestamp: now,
    };

    const sortedTokens = sortTokens(allTokens, sortParam);

    return NextResponse.json({
      success: true,
      count: sortedTokens.length,
      tokens: sortedTokens,
      updatedAt: now,
      cached: false,
    });
  } catch (error) {
    console.error("Leaderboard tokens API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}

/**
 * Sort tokens dynamically:
 * - Native ETN pinned at #1.
 * - Remaining slots #2..N sorted by requested metric.
 */
function sortTokens(
  tokens: LeaderboardToken[],
  sortMetric: string
): LeaderboardToken[] {
  const nativeEtn = tokens.find((t) => t.isNative);
  const erc20s = tokens.filter((t) => !t.isNative);

  if (sortMetric === "holders") {
    // Rank by holders count
    erc20s.sort((a, b) => {
      if (b.holdersCount !== a.holdersCount) {
        return b.holdersCount - a.holdersCount;
      }
      return (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0);
    });
  } else if (sortMetric === "liquidity") {
    // Rank by liquidity depth
    erc20s.sort((a, b) => {
      const liqA = a.liquidityDepthUsd ?? 0;
      const liqB = b.liquidityDepthUsd ?? 0;
      if (liqB !== liqA) {
        return liqB - liqA;
      }
      return b.holdersCount - a.holdersCount;
    });
  } else {
    // Default: "market-cap" / Trending
    erc20s.sort((a, b) => {
      const mcapA = a.marketCapUsd ?? 0;
      const mcapB = b.marketCapUsd ?? 0;
      if (mcapB !== mcapA) {
        return mcapB - mcapA;
      }
      return b.holdersCount - a.holdersCount;
    });
  }

  // Combine ETN at #1 and limit to Top 50 total
  const result: LeaderboardToken[] = [];
  if (nativeEtn) {
    result.push({ ...nativeEtn, rank: 1 });
  }

  erc20s.slice(0, 49).forEach((token, index) => {
    result.push({
      ...token,
      rank: index + 2,
    });
  });

  return result;
}
