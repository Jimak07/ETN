import { isAddress, type Address } from "viem";

import { DEFAULT_ETN_CHAIN, ETN_MAINNET, ETN_TESTNET, type EtnChainConfig } from "./etn";

/**
 * The chains the write path can act on.
 *
 * `etn.ts` stays the ETN-specific module - it holds the monitoring constants and
 * the two Electroneum networks the dashboard watches. This module is the wider
 * registry the batch sender draws its network dropdown from, and it reuses the
 * same record shape so the wallet payload, the viem chain definition and the
 * explorer link keep coming from one place per network.
 *
 * `explorerApiKey` is an optional extra field rather than part of the ETN record
 * because only Etherscan-family explorers need one; the Electroneum explorers
 * answer without a key.
 */
export type ChainConfig = EtnChainConfig & {
  /** Optional Etherscan-style API key, appended by the explorer reader. */
  explorerApiKey?: string | null;
  /** Optional deployed PulseMultiSender contract address for this chain. */
  multiSenderAddress?: `0x${string}`;
  /**
   * Explicit boolean flag indicating whether the multi-sender contract and functionality
   * is deployed, verified, and enabled on this network.
   */
  isEnabled: boolean;
};

function optionalKey(...candidates: Array<string | undefined>): string | null {
  for (const candidate of candidates) {
    const value = (candidate ?? "").trim();
    if (value.length > 0) return value;
  }
  return null;
}

const ETHEREUM_RPC_URL =
  (process.env.NEXT_PUBLIC_ETHEREUM_RPC ?? "").trim() || "https://ethereum-rpc.publicnode.com";

const BSC_RPC_URL =
  (process.env.NEXT_PUBLIC_BSC_RPC ?? "").trim() || "https://bsc-dataseed.bnbchain.org";

/** Electroneum mainnet with deployed multi-sender contract. */
export const ETN_MAINNET_CHAIN: ChainConfig = {
  ...ETN_MAINNET,
  multiSenderAddress: "0x369D2Fe03Ae03915D7a48D58Daf0dcd8207245CF",
  isEnabled: true,
};

/** Electroneum testnet with deployed multi-sender contract. */
export const ETN_TESTNET_CHAIN: ChainConfig = {
  ...ETN_TESTNET,
  multiSenderAddress: "0x505Cfac9c4F8B6aB8a8AbeBf37bFC9BFe790f1D0",
  isEnabled: true,
};

/**
 * Ethereum mainnet.
 *
 * A first-class entry rather than a hardcoded special case, so the same
 * validation, batching and receipt handling apply. Nothing can be *sent* here
 * until a PulseMultiSender deployment is configured for the chain id, which the
 * panel states plainly instead of pretending the batch is ready.
 */
export const ETHEREUM: ChainConfig = {
  id: 1,
  idHex: "0x1",
  name: "Ethereum",
  label: "Mainnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  explorerUrl: "https://etherscan.io",
  explorerApiUrl: "https://api.etherscan.io/api",
  explorerApiKey: optionalKey(process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY),
  rpcUrls: [ETHEREUM_RPC_URL, "https://eth.llamarpc.com"],
  testnet: false,
  multiSenderAddress: undefined,
  isEnabled: false,
};

/** BNB Smart Chain mainnet. */
export const BNB_SMART_CHAIN: ChainConfig = {
  id: 56,
  idHex: "0x38",
  name: "BNB Smart Chain",
  label: "Mainnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  explorerUrl: "https://bscscan.com",
  explorerApiUrl: "https://api.bscscan.com/api",
  explorerApiKey: optionalKey(process.env.NEXT_PUBLIC_BSCSCAN_API_KEY),
  rpcUrls: [BSC_RPC_URL, "https://bsc-rpc.publicnode.com"],
  testnet: false,
  multiSenderAddress: undefined,
  isEnabled: false,
};

const CHAINS_LIST: readonly ChainConfig[] = [
  ETN_MAINNET_CHAIN,
  ETN_TESTNET_CHAIN,
  ETHEREUM,
  BNB_SMART_CHAIN,
];

export type SupportedChains = Record<number, ChainConfig | undefined>;

/**
 * Every selectable network, Electroneum first, keyed by chain id.
 *
 * Dictionary mapping: chainId -> ChainConfig (e.g. SUPPORTED_CHAINS[chainId]?.multiSenderAddress).
 * Use Object.values(SUPPORTED_CHAINS) when an array iteration is needed.
 */
export const SUPPORTED_CHAINS: SupportedChains = {
  [ETN_MAINNET_CHAIN.id]: ETN_MAINNET_CHAIN,
  [ETN_TESTNET_CHAIN.id]: ETN_TESTNET_CHAIN,
  [ETHEREUM.id]: ETHEREUM,
  [BNB_SMART_CHAIN.id]: BNB_SMART_CHAIN,
};

/** Chain id shown before a wallet reports one. */
export const DEFAULT_CHAIN_ID = DEFAULT_ETN_CHAIN.id;

export function getChainConfig(chainId: number | null | undefined): ChainConfig | null {
  if (typeof chainId !== "number" || !Number.isInteger(chainId)) return null;
  return SUPPORTED_CHAINS[chainId] ?? null;
}

export function isSupportedChain(chainId: number | null | undefined): boolean {
  return getChainConfig(chainId) !== null;
}

/** Returns true only if the network is supported AND has active contract deployment enabled. */
export function isChainEnabled(chainId: number | null | undefined): boolean {
  if (typeof chainId !== "number" || !Number.isInteger(chainId)) return false;
  const config = SUPPORTED_CHAINS[chainId];
  return Boolean(config && config.isEnabled && config.multiSenderAddress);
}

/** Chain descriptor for display, falling back strictly to Electroneum Mainnet when unconfigured or disabled. */
export function getChainConfigOrDefault(chainId: number | null | undefined): ChainConfig {
  const config = getChainConfig(chainId);
  return config && config.isEnabled ? config : ETN_MAINNET_CHAIN;
}

export interface PopularToken {
  address: Address;
  symbol: string;
  decimals: number;
}

/**
 * High-volume tokens, per chain, as data.
 *
 * Populated with verified canonical tokens on Electroneum Mainnet (WETN, BOLT, PDY, BUDDY)
 * alongside benchmark tokens on external testbeds.
 */
const LISTED_TOKENS: Record<number, readonly PopularToken[]> = {
  [ETN_MAINNET_CHAIN.id]: [
    { address: "0x138DAFbDA0CCB3d8E39C19edb0510Fc31b7C1c77", symbol: "WETN", decimals: 18 },
    { address: "0x043fAa1b5C5FC9a7dc35171f290c29ECDE0cCff1", symbol: "BOLT", decimals: 18 },
    { address: "0xc20d02538368D8F7deBeAeB99D9a8b4d4D1DDC1C", symbol: "PDY", decimals: 18 },
    { address: "0x38B54f147303887BD2E932373432FfCBD11Ff6a5", symbol: "BUDDY", decimals: 18 },
  ],
  [ETHEREUM.id]: [
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6 },
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6 },
    { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", symbol: "DAI", decimals: 18 },
    { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18 },
  ],
  [BNB_SMART_CHAIN.id]: [
    { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", decimals: 18 },
    { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18 },
    { address: "0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3", symbol: "DAI", decimals: 18 },
    { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "WBNB", decimals: 18 },
  ],
};

export const POPULAR_TOKENS: Record<number, readonly PopularToken[]> = Object.fromEntries(
  Object.entries(LISTED_TOKENS).map(([chainId, tokens]) => [
    chainId,
    tokens.filter((token) => isAddress(token.address, { strict: false })),
  ]),
);

/** The listed tokens for a chain, or an empty list when it has none yet. */
export function getPopularTokens(chainId: number | null | undefined): readonly PopularToken[] {
  if (typeof chainId !== "number") return [];
  return POPULAR_TOKENS[chainId] ?? [];
}

/** Finds a listed token by address, so a re-selected token restores its decimals. */
export function findPopularToken(
  chainId: number | null | undefined,
  address: string,
): PopularToken | null {
  const needle = address.trim().toLowerCase();
  if (needle.length === 0) return null;
  return getPopularTokens(chainId).find((token) => token.address.toLowerCase() === needle) ?? null;
}
