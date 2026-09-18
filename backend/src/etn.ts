/**
 * Network constants for the Electroneum Smart Chain (ETN-SC).
 *
 * Self-contained on purpose: the worker is deployed independently of the
 * Next.js frontend, so it must not import across workspace boundaries.
 */

export const ETN_CHAIN_ID = 52014;
export const ETN_CHAIN_NAME = "Electroneum";
export const ETN_NATIVE_SYMBOL = "ETN";
export const ETN_NATIVE_DECIMALS = 18;

export const ETN_EXPLORER_URL = "https://blockexplorer.electroneum.com";
export const ETN_EXPLORER_API_URL = `${ETN_EXPLORER_URL}/api`;

export const ETN_NATIVE_CURRENCY = {
  name: ETN_CHAIN_NAME,
  symbol: ETN_NATIVE_SYMBOL,
  decimals: ETN_NATIVE_DECIMALS,
} as const;

export interface MonitoredRpc {
  id: string;
  /** Short label reported in logs and alerts. */
  name: string;
  displayName: string;
  operator: string;
  url: string;
}

/** The RPC endpoints the worker polls on every cycle. */
export const MONITORED_RPCS: readonly MonitoredRpc[] = [
  {
    id: "official",
    name: "Official",
    displayName: "Electroneum Official",
    operator: "Electroneum",
    url: "https://rpc.electroneum.com",
  },
  {
    id: "ankr",
    name: "Ankr",
    displayName: "Ankr Public",
    operator: "Ankr",
    url: "https://rpc.ankr.com/electroneum",
  },
] as const;

/** Default polling cadence. Overridable with POLL_INTERVAL_MS. */
export const POLL_INTERVAL_MS = 5000;

/** Maximum blocks a node may lag before it is flagged as out of sync. */
export const DRIFT_THRESHOLD = 3;

/** Latency at or above this (ms) marks a node as degraded. */
export const LATENCY_THRESHOLD_MS = 500;

/** Hard ceiling for a single JSON-RPC round trip. */
export const RPC_REQUEST_TIMEOUT_MS = 3000;
