import { formatGwei } from "viem";

import { getRpcClient } from "./etn-chain";
import {
  DRIFT_THRESHOLD,
  LATENCY_THRESHOLD_MS,
  MONITORED_RPCS,
  type MonitoredRpc,
} from "./etn";
import type { PulseSnapshot, RpcProbe, RpcStatus } from "./types";

/**
 * Low-level RPC probing primitives.
 *
 * The `/api/pulse` route owns the pulse pipeline (parallel polling, drift
 * detection, payload shape); this module owns the request mechanics and the
 * BigInt-safe conversions.
 */

/** Wall-clock budget for an entire pulse, including both probes. */
export const SERVER_DEADLINE_MS = 5000;

/** The follow-up block/gas read is tighter: the RPC already answered once. */
export const STATS_REQUEST_TIMEOUT_MS = 1500;

/** Round-trip bucket a latency value falls into (before drift is applied). */
export function classifyLatency(latencyMs: number): RpcStatus {
  return latencyMs < LATENCY_THRESHOLD_MS ? "healthy" : "degraded";
}

export function describeError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown transport error";
  const flattened = raw.replace(/\s+/g, " ").trim();
  return flattened.length > 160 ? `${flattened.slice(0, 157)}...` : flattened;
}

/**
 * BigInt -> number conversion for JSON.
 *
 * Block heights are far below 2^53 today, but the guard keeps a malformed or
 * hostile response from silently losing precision on the wire.
 */
export function toSafeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${label} ${value.toString()} exceeds the safe integer range`);
  }
  return Number(value);
}

/**
 * Gwei as a decimal string.
 *
 * Gas prices on ETN-SC can be tiny (0.001 Gwei), so the value is serialised as
 * a string instead of a float. `formatGwei` trims trailing zeros, which keeps
 * "0.001" exact and "1" compact.
 */
export function toGweiString(wei: bigint): string {
  return formatGwei(wei);
}

function elapsedSince(startedAt: number): number {
  // A reused keep-alive socket can report a sub-millisecond diff: keep a 1 ms
  // floor so the dashboard never shows a meaningless "0 ms".
  return Math.max(1, Math.round(performance.now() - startedAt));
}

/**
 * Pings an endpoint and reads its block number concurrently.
 *
 * Both calls are issued together: the `eth_chainId` round trip measures pure
 * endpoint latency, while `eth_blockNumber` supplies the height used for sync
 * validation. If the ping is unsupported but the block query works, the block
 * round trip is used as the latency. Neither branch rejects — failures become an
 * `offline` probe with `blockNumber: null`.
 */
export async function probeRpc(rpc: MonitoredRpc): Promise<RpcProbe> {
  const client = getRpcClient(rpc);

  const ping = (async () => {
    const startedAt = performance.now();
    await client.getChainId();
    return elapsedSince(startedAt);
  })();

  const blockQuery = (async () => {
    const startedAt = performance.now();
    const blockNumber = toSafeNumber(await client.getBlockNumber(), "block number");
    return { blockNumber, latencyMs: elapsedSince(startedAt) };
  })();

  const [pingResult, blockResult] = await Promise.allSettled([ping, blockQuery]);

  const base = {
    id: rpc.id,
    name: rpc.name,
    displayName: rpc.displayName,
    operator: rpc.operator,
    role: rpc.role,
    url: rpc.url,
  };

  // No block number means we cannot validate sync: treat the node as offline.
  if (blockResult.status === "rejected") {
    return {
      ...base,
      latencyMs: pingResult.status === "fulfilled" ? pingResult.value : null,
      blockNumber: null,
      drift: null,
      status: "offline",
      error: describeError(blockResult.reason),
    };
  }

  const latencyMs =
    pingResult.status === "fulfilled" ? pingResult.value : blockResult.value.latencyMs;

  return {
    ...base,
    latencyMs,
    blockNumber: blockResult.value.blockNumber,
    drift: null,
    status: classifyLatency(latencyMs),
  };
}

/** Probe placeholder for an endpoint whose probe promise itself rejected. */
export function offlineProbe(rpc: MonitoredRpc, reason: unknown): RpcProbe {
  return {
    id: rpc.id,
    name: rpc.name,
    displayName: rpc.displayName,
    operator: rpc.operator,
    role: rpc.role,
    url: rpc.url,
    latencyMs: null,
    blockNumber: null,
    drift: null,
    status: "offline",
    error: describeError(reason),
  };
}

/**
 * Fastest node worth trusting for a follow-up read: in-sync nodes first, then
 * by latency. Offline nodes are never selected.
 */
export function pickFastestHealthy(probes: RpcProbe[]): RpcProbe | null {
  const candidates = probes.filter(
    (probe) => probe.status !== "offline" && probe.latencyMs !== null,
  );
  if (candidates.length === 0) return null;

  return (
    [...candidates].sort((a, b) => {
      const healthDelta = (a.status === "healthy" ? 0 : 1) - (b.status === "healthy" ? 0 : 1);
      if (healthDelta !== 0) return healthDelta;
      return (a.latencyMs ?? Number.POSITIVE_INFINITY) - (b.latencyMs ?? Number.POSITIVE_INFINITY);
    })[0] ?? null
  );
}

/** Resolves to null instead of throwing (used for optional follow-up reads). */
export async function safeCall<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch {
    return null;
  }
}

/**
 * Valid snapshot used whenever the pipeline cannot finish in time. Every node is
 * reported as offline, so consumers always receive the documented JSON shape
 * instead of a hanging request.
 */
export function createEmptySnapshot(reason: string, durationMs = 0): PulseSnapshot {
  return {
    ok: false,
    checkedAt: new Date().toISOString(),
    durationMs,
    highestNetworkBlock: null,
    gasPriceGwei: null,
    baseFeeGwei: null,
    blockTimestamp: null,
    driftThreshold: DRIFT_THRESHOLD,
    fastestRpcId: null,
    outOfSyncRpcIds: [],
    rpcs: MONITORED_RPCS.map((rpc) => ({
      id: rpc.id,
      name: rpc.name,
      displayName: rpc.displayName,
      operator: rpc.operator,
      role: rpc.role,
      url: rpc.url,
      latencyMs: null,
      blockNumber: null,
      drift: null,
      status: "offline" as RpcStatus,
      error: reason,
    })),
    history: [],
    errors: [reason],
  };
}

/**
 * Races a collection step against a hard deadline. Slow or black-holed RPC
 * endpoints therefore degrade the payload instead of stalling the response.
 */
export async function withDeadline<T>(
  collect: () => Promise<T>,
  onTimeout: () => Promise<T> | T,
): Promise<T> {
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<T>((resolve) => {
    deadlineTimer = setTimeout(() => {
      void Promise.resolve(onTimeout()).then(resolve);
    }, SERVER_DEADLINE_MS);
  });

  try {
    return await Promise.race([collect(), deadline]);
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
  }
}
