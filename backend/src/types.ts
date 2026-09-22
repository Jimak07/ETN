/**
 * Wire + persistence types for the monitoring worker.
 *
 * These intentionally mirror the shapes used by the frontend dashboard
 * (`frontend/lib/types.ts`) so a sample written here can be read straight back
 * into the pulse sparkline. The two apps are decoupled on purpose — the worker
 * must keep running even if the frontend is redeployed or offline — so the
 * duplication is deliberate rather than an oversight.
 */

/**
 * Health of a single RPC endpoint.
 *
 * healthy  -> answered fast *and* in sync with the network tip
 * degraded -> slow, or drifting past the drift threshold
 * offline  -> the request threw or timed out
 */
export type RpcStatus = "healthy" | "degraded" | "offline";

/** Result of probing one endpoint: a latency ping plus a block-number read. */
export interface RpcProbe {
  id: string;
  /** Short label used in logs and alerts, e.g. "Official". */
  name: string;
  url: string;
  /** Round-trip time of the latency ping in ms; null when nothing answered. */
  latencyMs: number | null;
  /** Latest block reported by this node; null when it could not be read. */
  blockNumber: number | null;
  /**
   * Epoch ms when that block-number read landed. Comparing the earliest of
   * these against the WSS stream's own first sighting of the same height is
   * what produces `wssLatency`; null when the read failed.
   */
  blockObservedAt: number | null;
  /** highestNetworkBlock - blockNumber; null while offline. */
  drift: number | null;
  status: RpcStatus;
  /** Transport error, or the drift warning ("Out of sync by X blocks"). */
  error?: string;
}

/**
 * One persisted sample. Matches the `public.pulse_samples` row in
 * `supabase/schema.sql`, which is also what the dashboard reads back.
 */
export interface PulseSample {
  /** Epoch milliseconds — the natural key, so replayed cycles dedupe. */
  t: number;
  highestNetworkBlock: number | null;
  /** Precision-safe decimal string, e.g. "1.000000007". */
  gasPriceGwei: string | null;
  /** rpc id -> latency in ms. */
  latencies: Record<string, number | null>;
  /** rpc id -> status. */
  statuses: Record<string, RpcStatus>;
  /** rpc id -> drift in blocks. */
  drifts: Record<string, number | null>;
  /**
   * WebSocket head start in ms: how much earlier the `newHeads` stream saw the
   * tip than the HTTP probe did. Null when the stream is disabled, down, or the
   * two sightings are further apart than one poll interval (see wss.ts).
   */
  wssLatency: number | null;
}
