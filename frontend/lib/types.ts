import type { RpcId, RpcRole } from "./etn";

/**
 * Health of a single RPC endpoint.
 *
 * healthy  -> answered fast (< LATENCY_THRESHOLD_MS) *and* in sync
 * degraded -> slow, or drifting past DRIFT_THRESHOLD blocks behind the network
 * offline  -> the request threw or timed out
 */
export type RpcStatus = "healthy" | "degraded" | "offline";

/** Result of concurrently pinging one RPC and reading its block number. */
export interface RpcProbe {
  id: RpcId;
  /** Short label used in the UI, e.g. "Official". */
  name: string;
  /** Full label, e.g. "Electroneum Official". */
  displayName: string;
  operator: string;
  role: RpcRole;
  url: string;
  /** Round-trip time of the latency ping in ms; null when nothing answered. */
  latencyMs: number | null;
  /** Latest block reported by this node; null when it could not be read. */
  blockNumber: number | null;
  /** highestNetworkBlock - blockNumber; null while offline. */
  drift: number | null;
  status: RpcStatus;
  /** Transport error, or the drift warning ("Out of sync by X blocks"). */
  error?: string;
}

/** One recorded pulse sample (also the row shape used for Supabase logging). */
export interface PulseHistoryPoint {
  /** Epoch milliseconds of the sample. */
  t: number;
  highestNetworkBlock: number | null;
  /** Precision-safe decimal string, e.g. "0.001". */
  gasPriceGwei: string | null;
  /** rpc id -> latency in ms. */
  latencies: Record<string, number | null>;
  /** rpc id -> status. */
  statuses: Record<string, RpcStatus>;
  /** rpc id -> drift in blocks. */
  drifts: Record<string, number | null>;
}

/**
 * Payload returned by `GET /api/pulse`.
 *
 * BigInt values never reach the wire: heights are converted with
 * `toSafeNumber()` and Gwei amounts are formatted into decimal strings.
 */
export interface PulseSnapshot {
  /** true when at least one monitored RPC answered. */
  ok: boolean;
  checkedAt: string;
  /** Wall-clock time the engine spent assembling this snapshot. */
  durationMs: number;
  /** Highest block seen across every node that answered. */
  highestNetworkBlock: number | null;
  /** Gas price as a decimal Gwei string (empty string never; null if unknown). */
  gasPriceGwei: string | null;
  baseFeeGwei: string | null;
  /** Unix seconds of the latest block. */
  blockTimestamp: number | null;
  /** Blocks a node may lag before it is reported as out of sync. */
  driftThreshold: number;
  fastestRpcId: string | null;
  /** Ids of nodes whose drift exceeded the threshold. */
  outOfSyncRpcIds: string[];
  rpcs: RpcProbe[];
  /** Rolling window of recent samples, oldest first. */
  history: PulseHistoryPoint[];
  errors: string[];
}

export type PulseConnection = "connecting" | "live" | "degraded" | "offline";
