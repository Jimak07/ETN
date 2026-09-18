/**
 * Network constants for the Electroneum Smart Chain (ETN-SC).
 *
 * This module is intentionally dependency-free so it can be imported from both
 * server (API route) and client (dashboard) code without pulling viem into the
 * browser bundle. The viem chain definition lives in `lib/etn-chain.ts`.
 */

export const ETN_CHAIN_ID = 52014;
export const ETN_CHAIN_ID_HEX = "0xcb2e";
export const ETN_CHAIN_NAME = "Electroneum";
export const ETN_NATIVE_SYMBOL = "ETN";
export const ETN_NATIVE_DECIMALS = 18;

export const ETN_EXPLORER_URL = "https://blockexplorer.electroneum.com";
export const ETN_EXPLORER_API_URL = `${ETN_EXPLORER_URL}/api`;

export const OFFICIAL_RPC_URL = "https://rpc.electroneum.com";
export const ANKR_RPC_URL = "https://rpc.ankr.com/electroneum";

export const ETN_NATIVE_CURRENCY = {
  name: ETN_CHAIN_NAME,
  symbol: ETN_NATIVE_SYMBOL,
  decimals: ETN_NATIVE_DECIMALS,
} as const;

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
