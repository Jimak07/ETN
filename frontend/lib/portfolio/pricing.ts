import { formatUnits, type Address, type PublicClient } from "viem";

import {
  ELECTROSWAP_V2_FACTORY_ADDRESS,
  NATIVE_ETN_ADDRESS,
  UNISWAP_V2_FACTORY_ABI,
  UNISWAP_V2_PAIR_ABI,
  WETN_ADDRESS,
} from "@/lib/constants/electroswap";
import {
  BLOCKSCOUT_STATS_URL,
  FALLBACK_ETN_USD_PRICE,
} from "@/lib/constants/myverse";

// In-memory price cache to prevent duplicate queries within short windows
const priceCache = new Map<string, { priceInEtn: number; timestamp: number }>();
let cachedEtnPrice: { priceUsd: number; timestamp: number } | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Fetch real-time ETN price in USD from Blockscout stats API with CoinGecko fallback.
 */
export async function fetchEtnUsdPrice(signal: AbortSignal = AbortSignal.timeout(8000)): Promise<number> {
  const now = Date.now();
  if (cachedEtnPrice && now - cachedEtnPrice.timestamp < CACHE_TTL_MS) {
    return cachedEtnPrice.priceUsd;
  }

  try {
    const res = await fetch(BLOCKSCOUT_STATS_URL, {
      signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });

    if (res.ok) {
      const data = (await res.json()) as { coin_price?: string | number | null };
      if (data?.coin_price) {
        const parsed = Number(data.coin_price);
        if (!Number.isNaN(parsed) && parsed > 0) {
          cachedEtnPrice = { priceUsd: parsed, timestamp: now };
          return parsed;
        }
      }
    }
  } catch {
    // Attempt CoinGecko fallback
  }

  try {
    const cgRes = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=electroneum&vs_currencies=usd",
      { signal, headers: { Accept: "application/json" } }
    );
    if (cgRes.ok) {
      const cgData = (await cgRes.json()) as { electroneum?: { usd?: number } };
      const usd = cgData?.electroneum?.usd;
      if (typeof usd === "number" && usd > 0) {
        cachedEtnPrice = { priceUsd: usd, timestamp: now };
        return usd;
      }
    }
  } catch {
    // Silently fall back to hardcoded default
  }

  return FALLBACK_ETN_USD_PRICE;
}

/**
 * Derive live token price in native ETN by querying ElectroSwap V2 Pair reserves against WETN.
 */
export async function fetchTokenPriceInEtn(
  tokenAddress: Address,
  tokenDecimals: number,
  client: PublicClient
): Promise<number> {
  const lower = tokenAddress.toLowerCase();

  // Native ETN and WETN are 1:1 with ETN
  if (lower === NATIVE_ETN_ADDRESS.toLowerCase() || lower === WETN_ADDRESS.toLowerCase()) {
    return 1.0;
  }

  const cached = priceCache.get(lower);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.priceInEtn;
  }

  try {
    // 1. Query Pair Address from ElectroSwap Factory
    const pairAddress = await client.readContract({
      address: ELECTROSWAP_V2_FACTORY_ADDRESS,
      abi: UNISWAP_V2_FACTORY_ABI,
      functionName: "getPair",
      args: [tokenAddress, WETN_ADDRESS],
    });

    if (!pairAddress || pairAddress === "0x0000000000000000000000000000000000000000") {
      priceCache.set(lower, { priceInEtn: 0, timestamp: Date.now() });
      return 0;
    }

    // 2. Query Pair Reserves and Token0
    const [token0, reserves] = await Promise.all([
      client.readContract({
        address: pairAddress,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: "token0",
      }),
      client.readContract({
        address: pairAddress,
        abi: UNISWAP_V2_PAIR_ABI,
        functionName: "getReserves",
      }),
    ]);

    const isToken0 = token0.toLowerCase() === lower;
    const reserveTokenRaw = isToken0 ? reserves[0] : reserves[1];
    const reserveWetnRaw = isToken0 ? reserves[1] : reserves[0];

    if (reserveTokenRaw <= 0n || reserveWetnRaw <= 0n) {
      priceCache.set(lower, { priceInEtn: 0, timestamp: Date.now() });
      return 0;
    }

    const tokenAmount = Number(formatUnits(reserveTokenRaw, tokenDecimals));
    const wetnAmount = Number(formatUnits(reserveWetnRaw, 18));

    if (tokenAmount <= 0) return 0;

    const priceInEtn = wetnAmount / tokenAmount;
    priceCache.set(lower, { priceInEtn, timestamp: Date.now() });
    return priceInEtn;
  } catch {
    priceCache.set(lower, { priceInEtn: 0, timestamp: Date.now() });
    return 0;
  }
}
