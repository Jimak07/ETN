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

/**
 * WebSocket endpoint for the `newHeads` subscription in `src/wss.ts`.
 *
 * The official node terminates WSS on the same host that serves HTTPS, which
 * makes it the natural default: it is the endpoint the HTTP poll already
 * trusts, so a difference between the two transports is a difference in
 * transport, not in the node behind it.
 */
export const ETN_WSS_URL = "wss://rpc.electroneum.com";

/**
 * Ankr publishes per-chain streams under a `/ws` suffix rather than on the
 * HTTPS path. Kept here as the documented alternative for WSS_RPC_URL; it is
 * not used by default because it is a different node than the one measured over
 * HTTP, which would put two variables in one measurement.
 */
export const ANKR_WSS_URL = "wss://rpc.ankr.com/electroneum/ws";

/** The stream subscribed to unless WSS_RPC_URL overrides it. */
export const DEFAULT_WSS_URL = ETN_WSS_URL;

/**
 * A stream that has delivered nothing for this long is treated as dead and
 * re-subscribed. viem reconnects a dropped socket and replays its subscription
 * on its own, but its reconnect budget (5 attempts, 2s apart, in viem 2.x) can
 * be spent, after which the subscription is dropped silently for good.
 */
export const WSS_STALE_AFTER_MS = 30_000;
