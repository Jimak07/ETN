import type { Address } from "viem";

/**
 * Feature flag for MyVerse Pro / Premium tier.
 * Enabled by default during the preview phase.
 * In production, this can be linked to an on-chain NFT pass or subscription smart contract.
 */
export const IS_PREMIUM_USER = true;

/**
 * Electroneum Blockscout REST API endpoints (v2).
 */
export const BLOCKSCOUT_API_BASE = "https://blockexplorer.electroneum.com/api/v2";
export const BLOCKSCOUT_STATS_URL = `${BLOCKSCOUT_API_BASE}/stats`;
export const BLOCKSCOUT_TOKENS_URL = `${BLOCKSCOUT_API_BASE}/tokens`;

/**
 * Fallback ETN USD price in case both Blockscout stats and CoinGecko are unreachable.
 */
export const FALLBACK_ETN_USD_PRICE = 0.00213;

/**
 * Curated preset showcase wallets for exploratory Whale / Watch mode.
 */
export interface ShowcaseWallet {
  address: Address;
  label: string;
  category: "Whale" | "DeFi" | "NFT Collector" | "Treasury";
  description: string;
}

export const SHOWCASE_WALLETS: readonly ShowcaseWallet[] = [
  {
    address: "0x79c0c8Fe02B2438ea44d35CEC24Bf36E89D2704b",
    label: "ETN Whale (BOLT & PANDY)",
    category: "Whale",
    description: "Top holder of ElectroSwap ecosystem tokens and meme assets.",
  },
  {
    address: "0xA8B9E92f9d64ecA79A0CC7b0Bd0128446eD1b6e1",
    label: "ElectroPunks Collector",
    category: "NFT Collector",
    description: "Active collector holding rare ElectroPunks and ElectroFox NFTs.",
  },
  {
    address: "0xc11b043ED7DaCA18e10c7FAE400BeB0c97837aD5",
    label: "DeFi Liquidity Provider",
    category: "DeFi",
    description: "Major liquidity supplier across ElectroSwap V2 pools.",
  },
  {
    address: "0x138DAFbDA0CCB3d8E39C19edb0510Fc31b7C1c77",
    label: "Wrapped Electroneum (WETN)",
    category: "Treasury",
    description: "Official canonical WETN reserve contract on Electroneum Mainnet.",
  },
];

export const DEFAULT_EXPLORER_ADDRESS: Address = SHOWCASE_WALLETS[0].address;

/**
 * LocalStorage keys for MyVerse persistence.
 */
export const STORAGE_KEYS = {
  WATCHLIST: "myverse_saved_watchlist_v1",
  ACTIVE_TIMEFRAME: "myverse_active_timeframe_v1",
  HIDE_DUST: "myverse_hide_dust_v1",
  CUSTOM_LABELS: "myverse_custom_labels_v1",
} as const;

/**
 * Dust threshold in USD. Any holding below this value is hidden when "Hide Dust" is active.
 */
export const DUST_THRESHOLD_USD = 0.05;
