/**
 * Network constants for the Electroneum Smart Chain (ETN-SC).
 *
 * This module is intentionally dependency-free so it can be imported from both
 * server (API route) and client (dashboard) code without pulling viem into the
 * browser bundle. The viem chain definitions live in `lib/etn-chain.ts`.
 *
 * Both mainnet and testnet are described here. The monitoring engine deliberately
 * stays on mainnet (it measures the network people actually transact on), while
 * the write-path modules let the connected wallet decide which chain they act on.
 */

/**
 * Everything that differs between the two Electroneum networks, in one record.
 *
 * Kept as data rather than as parallel sets of constants because the write path
 * has to key off `chainId` at runtime: one `getEtnChain(chainId)` lookup feeds
 * the contract address, the explorer link and the wallet's `wallet_addEthereumChain`
 * payload, so those four can never drift apart.
 */
export interface EtnChainConfig {
  /** EIP-155 chain id, e.g. 52014. */
  id: number;
  /** The same id as a 0x-prefixed hex string, which is what EIP-1193 and EIP-3085 require. */
  idHex: `0x${string}`;
  /** Name as wallets display it. */
  name: string;
  /** Short label for badges and log lines: "Mainnet" or "Testnet". */
  label: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  /** Human-facing block explorer root, without a trailing slash. */
  explorerUrl: string;
  explorerApiUrl: string;
  /** Endpoints tried in order by the fallback transport. */
  rpcUrls: readonly string[];
  testnet: boolean;
}

/**
 * Testnet RPCs are not published as consistently as mainnet ones, so the URL is
 * overridable. The default is the official testnet host; if it has moved, set
 * `NEXT_PUBLIC_ETN_TESTNET_RPC` and rebuild rather than editing this file.
 */
const TESTNET_RPC_URL =
  (process.env.NEXT_PUBLIC_ETN_TESTNET_RPC ?? "").trim() || "https://rpc-testnet.electroneum.com";

export const ETN_MAINNET: EtnChainConfig = {
  id: 52014,
  idHex: "0xcb2e",
  name: "Electroneum",
  label: "Mainnet",
  nativeCurrency: { name: "Electroneum", symbol: "ETN", decimals: 18 },
  explorerUrl: "https://blockexplorer.electroneum.com",
  explorerApiUrl: "https://blockexplorer.electroneum.com/api",
  rpcUrls: ["https://rpc.electroneum.com", "https://rpc.ankr.com/electroneum"],
  testnet: false,
};

export const ETN_TESTNET: EtnChainConfig = {
  id: 5201420,
  idHex: "0x4f5e0c",
  name: "Electroneum Testnet",
  label: "Testnet",
  nativeCurrency: { name: "Electroneum", symbol: "ETN", decimals: 18 },
  explorerUrl: "https://testnet-blockexplorer.electroneum.com",
  explorerApiUrl: "https://testnet-blockexplorer.electroneum.com/api",
  rpcUrls: [TESTNET_RPC_URL],
  testnet: true,
};

/** Every chain this app can act on, mainnet first so it reads as the default. */
export const SUPPORTED_ETN_CHAINS: readonly EtnChainConfig[] = [ETN_MAINNET, ETN_TESTNET];

/** What "no wallet connected yet" resolves to for display purposes. */
export const DEFAULT_ETN_CHAIN = ETN_MAINNET;

/** Returns the chain descriptor for an id, or null when the wallet is elsewhere. */
export function getEtnChain(chainId: number | null | undefined): EtnChainConfig | null {
  if (typeof chainId !== "number" || !Number.isInteger(chainId)) return null;
  return SUPPORTED_ETN_CHAINS.find((chain) => chain.id === chainId) ?? null;
}

export function isSupportedEtnChain(chainId: number | null | undefined): boolean {
  return getEtnChain(chainId) !== null;
}

/** Chain descriptor for display, falling back to mainnet when nothing is connected. */
export function getEtnChainOrDefault(chainId: number | null | undefined): EtnChainConfig {
  return getEtnChain(chainId) ?? DEFAULT_ETN_CHAIN;
}

/** Mainnet values, kept as flat exports because the monitoring engine uses them directly. */
export const ETN_CHAIN_ID = ETN_MAINNET.id;
export const ETN_CHAIN_ID_HEX = ETN_MAINNET.idHex;
export const ETN_CHAIN_NAME = ETN_MAINNET.name;
export const ETN_NATIVE_SYMBOL = ETN_MAINNET.nativeCurrency.symbol;
export const ETN_NATIVE_DECIMALS = ETN_MAINNET.nativeCurrency.decimals;

export const ETN_EXPLORER_URL = ETN_MAINNET.explorerUrl;
export const ETN_EXPLORER_API_URL = ETN_MAINNET.explorerApiUrl;

export const OFFICIAL_RPC_URL = ETN_MAINNET.rpcUrls[0];
export const ANKR_RPC_URL = ETN_MAINNET.rpcUrls[1];

export const ETN_NATIVE_CURRENCY = ETN_MAINNET.nativeCurrency;

export type RpcRole = "official" | "public";

/**
 * Stable ids of the monitored endpoints.
 *
 * Declared as literals so the dashboard can model "which endpoint am I
 * watching?" as a closed union rather than a bare string.
 */
export type RpcId = "official" | "ankr";

export const RPC_IDS: readonly RpcId[] = ["official", "ankr"];

/**
 * What the dashboard is currently bound to:
 *
 *   "official" | "ankr" -> that node's exact latency and status
 *   "fastest"           -> the minimum latency across every online node
 */
export type SelectedEndpoint = "fastest" | RpcId;

export function isRpcId(value: string): value is RpcId {
  return RPC_IDS.some((id) => id === value);
}

export interface MonitoredRpc {
  /** Stable key used for history graphs and React keys. */
  id: RpcId;
  /** Short label reported in the API payload, e.g. "Official". */
  name: string;
  /** Full label for UI headings, e.g. "Electroneum Official". */
  displayName: string;
  operator: string;
  role: RpcRole;
  url: string;
}

/** The RPC endpoints the monitoring engine pings on every request. */
export const MONITORED_RPCS: readonly MonitoredRpc[] = [
  {
    id: "official",
    name: "Official",
    displayName: "Electroneum Official",
    operator: "Electroneum",
    role: "official",
    url: OFFICIAL_RPC_URL,
  },
  {
    id: "ankr",
    name: "Ankr",
    displayName: "Ankr Public",
    operator: "Ankr",
    role: "public",
    url: ANKR_RPC_URL,
  },
] as const;

export function getMonitoredRpc(id: string): MonitoredRpc | undefined {
  return MONITORED_RPCS.find((rpc) => rpc.id === id);
}

/**
 * Rolling health thresholds (milliseconds).
 *
 * healthy  -> emerald  (< 500 ms)
 * degraded -> amber    (>= 500 ms but still answering)
 * offline  -> rose     (no answer / transport error)
 */
export const LATENCY_THRESHOLD_MS = 500;

/**
 * Maximum number of blocks a node may lag behind the highest block observed on
 * the network before it is flagged as out of sync (and forced to "degraded").
 */
export const DRIFT_THRESHOLD = 3;

/** Upper bound used purely to scale the latency bars in the UI. */
export const LATENCY_BAR_MAX_MS = 2000;

/**
 * Hard ceiling for a single JSON-RPC round trip. Kept well under
 * SERVER_DEADLINE_MS so a hanging endpoint fails the probe instead of the
 * whole request.
 */
export const RPC_REQUEST_TIMEOUT_MS = 3000;

/** Dashboard polling cadence. */
export const POLL_INTERVAL_MS = 5000;

/** Number of samples returned with each pulse response. */
export const HISTORY_LIMIT = 40;
