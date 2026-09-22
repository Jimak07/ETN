import { createPublicClient, defineChain, formatGwei, http, type PublicClient } from "viem";

import {
  ETN_CHAIN_ID,
  ETN_EXPLORER_API_URL,
  ETN_EXPLORER_URL,
  ETN_NATIVE_CURRENCY,
  MONITORED_RPCS,
  type MonitoredRpc,
} from "./etn.js";
import type { RpcProbe, RpcStatus } from "./types.js";

/** viem chain definition for the Electroneum Smart Chain mainnet. */
export const electroneum = defineChain({
  id: ETN_CHAIN_ID,
  name: "Electroneum",
  nativeCurrency: ETN_NATIVE_CURRENCY,
  rpcUrls: {
    default: {
      http: MONITORED_RPCS.map((rpc) => rpc.url),
    },
  },
  blockExplorers: {
    default: {
      name: "Electroneum Block Explorer",
      url: ETN_EXPLORER_URL,
      apiUrl: ETN_EXPLORER_API_URL,
    },
  },
  testnet: false,
});

const clientCache = new Map<string, PublicClient>();

/**
 * Memoised viem client per endpoint. Reusing clients keeps the connection pool
 * warm across cycles instead of renegotiating TLS every 5 seconds.
 */
export function getClient(rpc: MonitoredRpc, timeoutMs: number): PublicClient {
  const key = `${rpc.id}:${rpc.url}:${timeoutMs}`;
  const cached = clientCache.get(key);
  if (cached) return cached;

  const client = createPublicClient({
    chain: electroneum,
    transport: http(rpc.url, { timeout: timeoutMs, retryCount: 0 }),
  });

  clientCache.set(key, client);
  return client;
}

export function classifyLatency(latencyMs: number, latencyThresholdMs: number): RpcStatus {
  return latencyMs < latencyThresholdMs ? "healthy" : "degraded";
}

/** One-line, length-capped error text suitable for logs and Discord embeds. */
export function describeError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "unknown transport error";
  const flattened = raw.replace(/\s+/g, " ").trim();
  return flattened.length > 200 ? `${flattened.slice(0, 197)}...` : flattened;
}

/** BigInt -> number with a safe-integer guard, so JSON never loses precision. */
export function toSafeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${label} ${value.toString()} exceeds the safe integer range`);
  }
  return Number(value);
}

/**
 * Gwei as a decimal string. ETN-SC fees can be fractional to nine decimals
 * (e.g. "1.000000007"), so the value is serialised as a string rather than a
 * float to keep it exact end to end.
 */
export function toGweiString(wei: bigint): string {
  return formatGwei(wei);
}

function elapsedSince(startedAt: number): number {
  return Math.max(1, Math.round(performance.now() - startedAt));
}

/**
 * Pings one endpoint and reads its block number concurrently.
 *
 * The `eth_chainId` round trip measures pure endpoint latency while
 * `eth_blockNumber` supplies the height used for sync validation. Neither
 * branch rejects: a failure becomes an `offline` probe with `blockNumber: null`.
 */
export async function probeRpc(
  rpc: MonitoredRpc,
  timeoutMs: number,
  latencyThresholdMs: number,
): Promise<RpcProbe> {
  const client = getClient(rpc, timeoutMs);

  const ping = (async () => {
    const startedAt = performance.now();
    await client.getChainId();
    return elapsedSince(startedAt);
  })();

  const blockQuery = (async () => {
    const startedAt = performance.now();
    const blockNumber = toSafeNumber(await client.getBlockNumber(), "block number");
    // Stamped the moment the response lands, not when the batch settles: a slow
    // sibling endpoint must not look like a slow block read.
    return { blockNumber, latencyMs: elapsedSince(startedAt), observedAt: Date.now() };
  })();

  const [pingResult, blockResult] = await Promise.allSettled([ping, blockQuery]);

  const base = { id: rpc.id, name: rpc.name, url: rpc.url };

  // No block number means sync cannot be validated, so the node is not usable.
  if (blockResult.status === "rejected") {
    return {
      ...base,
      latencyMs: pingResult.status === "fulfilled" ? pingResult.value : null,
      blockNumber: null,
      blockObservedAt: null,
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
    blockObservedAt: blockResult.value.observedAt,
    drift: null,
    status: classifyLatency(latencyMs, latencyThresholdMs),
  };
}

/**
 * Probes every endpoint concurrently.
 *
 * `Promise.allSettled` is the whole point: a node that throws — DNS failure,
 * TLS error, socket that never answers — lands here as a rejected entry instead
 * of rejecting the batch, so one dead endpoint can never hang a cycle.
 */
export async function probeAllRpcs(
  rpcs: readonly MonitoredRpc[],
  timeoutMs: number,
  latencyThresholdMs: number,
): Promise<RpcProbe[]> {
  const settled = await Promise.allSettled(
    rpcs.map((rpc) => probeRpc(rpc, timeoutMs, latencyThresholdMs)),
  );

  return settled.map((entry, index) => {
    const rpc = rpcs[index];
    if (!rpc) throw new Error(`No RPC configured at index ${index}`);
    if (entry.status === "fulfilled") return entry.value;

    return {
      id: rpc.id,
      name: rpc.name,
      url: rpc.url,
      latencyMs: null,
      blockNumber: null,
      blockObservedAt: null,
      drift: null,
      status: "offline" as const,
      error: describeError(entry.reason),
    };
  });
}

/**
 * Earliest wall-clock moment any HTTP probe saw `blockNumber`.
 *
 * The minimum rather than the average: the question being answered is "when did
 * the network first tell us about this height over HTTP", and the node that
 * answered first did exactly that. Returns null when no probe reported that
 * height, which is the normal case for a height the stream saw between cycles.
 */
export function httpObservedAt(
  rpcs: readonly RpcProbe[],
  blockNumber: number | null,
): number | null {
  if (blockNumber === null) return null;

  const sightings = rpcs
    .filter((rpc) => rpc.blockNumber === blockNumber && rpc.blockObservedAt !== null)
    .map((rpc) => rpc.blockObservedAt as number);

  return sightings.length > 0 ? Math.min(...sightings) : null;
}

export interface ChainStats {
  gasPriceGwei: string | null;
  baseFeeGwei: string | null;
  blockTimestamp: number | null;
}

const EMPTY_STATS: ChainStats = { gasPriceGwei: null, baseFeeGwei: null, blockTimestamp: null };

/** Reads gas price and the latest block header from the healthiest node. */
export async function readChainStats(
  rpc: MonitoredRpc | null,
  timeoutMs: number,
): Promise<ChainStats> {
  if (!rpc) return EMPTY_STATS;

  const client = getClient(rpc, timeoutMs);
  const [gasPriceWei, latestBlock] = await Promise.all([
    safeCall(() => client.getGasPrice()),
    safeCall(() => client.getBlock({ blockTag: "latest" })),
  ]);

  const baseFeePerGas = latestBlock?.baseFeePerGas;

  return {
    gasPriceGwei: gasPriceWei === null ? null : toGweiString(gasPriceWei),
    baseFeeGwei:
      baseFeePerGas === undefined || baseFeePerGas === null ? null : toGweiString(baseFeePerGas),
    blockTimestamp: latestBlock ? Number(latestBlock.timestamp) : null,
  };
}

/** Resolves to null instead of throwing (used for optional follow-up reads). */
export async function safeCall<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch {
    return null;
  }
}

/** Fastest node worth trusting for a follow-up read; in-sync nodes win first. */
export function pickFastest(rpcs: readonly RpcProbe[]): RpcProbe | null {
  const candidates = rpcs.filter((rpc) => rpc.status !== "offline" && rpc.latencyMs !== null);
  if (candidates.length === 0) return null;

  return (
    [...candidates].sort((a, b) => {
      const healthDelta = (a.status === "healthy" ? 0 : 1) - (b.status === "healthy" ? 0 : 1);
      if (healthDelta !== 0) return healthDelta;
      return (a.latencyMs ?? Number.POSITIVE_INFINITY) - (b.latencyMs ?? Number.POSITIVE_INFINITY);
    })[0] ?? null
  );
}
