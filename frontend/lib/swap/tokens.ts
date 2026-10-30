import {
  erc20Abi,
  getAddress,
  isAddress,
  type Address,
  type PublicClient,
} from "viem";

import {
  DEFAULT_ECOSYSTEM_TOKENS,
  NATIVE_ETN_TOKEN,
  WETN_ADDRESS,
  type TokenInfo,
} from "@/lib/constants/electroswap";

const BLOCKSCOUT_TOKENS_ENDPOINT = "https://blockexplorer.electroneum.com/api/v2/tokens";
const CUSTOM_TOKENS_STORAGE_KEY = "etn_electroswap_custom_tokens";

interface BlockscoutTokenItem {
  address?: string;
  name?: string | null;
  symbol?: string | null;
  decimals?: string | null;
  type?: string | null;
  icon_url?: string | null;
}

interface BlockscoutTokensResponse {
  items?: BlockscoutTokenItem[];
  next_page_params?: unknown;
}

/**
 * Fetch verified ecosystem tokens from Electroneum Blockscout REST API.
 * Deduplicates and prepends Native ETN as the primary token.
 */
export async function fetchBlockscoutTokens(signal?: AbortSignal): Promise<TokenInfo[]> {
  const result: TokenInfo[] = [...DEFAULT_ECOSYSTEM_TOKENS];
  const seenAddresses = new Set<string>(
    result.map((t) => t.address.toLowerCase())
  );

  try {
    const res = await fetch(BLOCKSCOUT_TOKENS_ENDPOINT, {
      signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return result;
    }

    const data = (await res.json()) as BlockscoutTokensResponse;
    const items = Array.isArray(data.items) ? data.items : [];

    for (const item of items) {
      if (!item.address || !isAddress(item.address, { strict: false })) continue;
      // Filter out non-ERC20s like ERC-721 or ERC-1155 NFTs
      if (item.type && item.type !== "ERC-20") continue;

      const checksumAddress = getAddress(item.address);
      const lower = checksumAddress.toLowerCase();
      if (seenAddresses.has(lower)) continue;

      const decimals = item.decimals ? Number.parseInt(item.decimals, 10) : 18;
      if (Number.isNaN(decimals) || decimals < 0 || decimals > 36) continue;

      seenAddresses.add(lower);
      result.push({
        address: checksumAddress,
        symbol: item.symbol?.trim() || "TOKEN",
        name: item.name?.trim() || "Ecosystem Token",
        decimals,
        iconUrl: item.icon_url || null,
      });
    }

    return result;
  } catch {
    // If Blockscout is down or times out, fallback to curated ecosystem tokens
    return result;
  }
}

/**
 * Perform on-chain verification for any arbitrary contract address pasted by user.
 * Queries symbol(), name(), and decimals() directly from the ETN-SC node.
 */
export async function verifyOnChainToken(
  rawAddress: string,
  client: PublicClient
): Promise<TokenInfo | null> {
  const clean = rawAddress.trim();
  if (!isAddress(clean, { strict: false })) return null;

  try {
    const address = getAddress(clean);

    // If it's WETN, return canonical representation
    if (address.toLowerCase() === WETN_ADDRESS.toLowerCase()) {
      return {
        address,
        symbol: "WETN",
        name: "Wrapped Electroneum",
        decimals: 18,
      };
    }

    const [symbolResult, nameResult, decimalsResult] = await Promise.all([
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: "symbol",
      }).catch(() => null),
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: "name",
      }).catch(() => null),
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: "decimals",
      }).catch(() => null),
    ]);

    if (decimalsResult === null || symbolResult === null) {
      // Contract does not expose ERC-20 standard metadata methods
      return null;
    }

    return {
      address,
      symbol: String(symbolResult || "CUSTOM"),
      name: String(nameResult || "Custom Token"),
      decimals: Number(decimalsResult),
      isCustom: true,
    };
  } catch {
    return null;
  }
}

/**
 * Load imported tokens from local storage with strict schema validation.
 */
export function getStoredCustomTokens(): TokenInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_TOKENS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 50)
      .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === "object" && typeof t.address === "string" && isAddress(t.address, { strict: false })))
      .map((t) => ({
        address: getAddress(t.address as string),
        symbol: String(t.symbol || "UNKNOWN").trim().slice(0, 16),
        name: String(t.name || "Custom Token").trim().slice(0, 32),
        decimals: typeof t.decimals === "number" && Number.isInteger(t.decimals) && t.decimals >= 0 && t.decimals <= 36 ? t.decimals : 18,
        isCustom: true,
      }));
  } catch {
    return [];
  }
}

/**
 * Persist an imported token to local storage.
 */
export function saveCustomToken(token: TokenInfo): TokenInfo[] {
  if (typeof window === "undefined") return [];
  if (!isAddress(token.address, { strict: false })) return getStoredCustomTokens();

  try {
    const checksum = getAddress(token.address);
    const validatedToken: TokenInfo = {
      address: checksum,
      symbol: String(token.symbol || "UNKNOWN").trim().slice(0, 16),
      name: String(token.name || "Custom Token").trim().slice(0, 32),
      decimals: typeof token.decimals === "number" && Number.isInteger(token.decimals) && token.decimals >= 0 && token.decimals <= 36 ? token.decimals : 18,
      isCustom: true,
    };

    const existing = getStoredCustomTokens();
    const filtered = existing.filter(
      (t) => t.address.toLowerCase() !== checksum.toLowerCase()
    );
    const updated = [validatedToken, ...filtered].slice(0, 50);
    localStorage.setItem(CUSTOM_TOKENS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

/**
 * Remove an imported token from local storage.
 */
export function removeCustomToken(address: Address): TokenInfo[] {
  if (typeof window === "undefined") return [];
  try {
    const existing = getStoredCustomTokens();
    const updated = existing.filter(
      (t) => t.address.toLowerCase() !== address.toLowerCase()
    );
    localStorage.setItem(CUSTOM_TOKENS_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}
