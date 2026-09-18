import { NextResponse } from "next/server";

import { getRpcClient } from "@/lib/etn-chain";
import {
  DRIFT_THRESHOLD,
  ETN_CHAIN_ID,
  MONITORED_RPCS,
  getMonitoredRpc,
} from "@/lib/etn";
import {
  SERVER_DEADLINE_MS,
  STATS_REQUEST_TIMEOUT_MS,
  createEmptySnapshot,
  describeError,
  offlineProbe,
  pickFastestHealthy,
  probeRpc,
  safeCall,
  toGweiString,
  withDeadline,
} from "@/lib/pulse-engine";
import { readPulseHistory, recordPulseSample } from "@/lib/pulse-store";
import type { PulseHistoryPoint, PulseSnapshot, RpcProbe } from "@/lib/types";

// Telemetry must never be cached or statically optimised.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const NO_STORE = "no-store, no-cache, must-revalidate, max-age=0";

/* -------------------------------------------------------------------------- *
 * 1. Parallel RPC polling
 * -------------------------------------------------------------------------- */

/**
 * Probes every monitored endpoint (Official Electroneum + Ankr) concurrently.
 *
 * `Promise.allSettled` is deliberate: a node that throws — DNS failure, TLS
 * error, timeout — lands here as a rejected entry instead of rejecting the whole
 * batch, so one offline node can never hang the API response. Each probe also
 * uses `allSettled` internally for its ping/block pair, so this is the second
 * line of defence for requirement "one bad node must not break the payload".
 */
async function probeAllRpcs(): Promise<RpcProbe[]> {
  const results = await Promise.allSettled(MONITORED_RPCS.map((rpc) => probeRpc(rpc)));

  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;

    const rpc = MONITORED_RPCS[index];
    if (!rpc) throw new Error(`Unknown RPC at index ${index}`);
    return offlineProbe(rpc, result.reason);
  });
}

/* -------------------------------------------------------------------------- *
 * 2. Drift detection (synchronisation validation)
 * -------------------------------------------------------------------------- */

/** Highest block seen across the nodes that answered. */
function findHighestNetworkBlock(rpcs: RpcProbe[]): number | null {
  const heights = rpcs
    .map((rpc) => rpc.blockNumber)
    .filter((height): height is number => typeof height === "number");

  return heights.length > 0 ? Math.max(...heights) : null;
}

interface DriftReport {
  rpcs: RpcProbe[];
  outOfSyncRpcIds: string[];
  errors: string[];
}

/**
 * Compares every node against the highest observed block.
 *
 *   drift = highestNetworkBlock - rpc.blockNumber
 *
 * A node more than DRIFT_THRESHOLD blocks behind is forcefully reported as
 * "degraded" with the warning "Out of sync by X blocks" — even when its latency
 * is well under 500 ms. Nodes that never answered keep `drift: null`.
 */
function applyDriftDetection(
  rpcs: RpcProbe[],
  highestNetworkBlock: number | null,
): DriftReport {
  const outOfSyncRpcIds: string[] = [];
  const errors: string[] = [];

  const validated = rpcs.map((rpc) => {
    if (highestNetworkBlock === null || rpc.blockNumber === null) return rpc;

    const drift = Math.max(0, highestNetworkBlock - rpc.blockNumber);

    if (drift > DRIFT_THRESHOLD) {
      const warning = `Out of sync by ${drift} blocks`;
      outOfSyncRpcIds.push(rpc.id);
      errors.push(`${rpc.name}: ${warning}`);
      return { ...rpc, drift, status: "degraded" as const, error: warning };
    }

    return { ...rpc, drift };
  });

  return { rpcs: validated, outOfSyncRpcIds, errors };
}

/* -------------------------------------------------------------------------- *
 * 3. Chain stats (gas price / base fee)
 * -------------------------------------------------------------------------- */

interface ChainStats {
  gasPriceGwei: string | null;
  baseFeeGwei: string | null;
  blockTimestamp: number | null;
}

const EMPTY_STATS: ChainStats = { gasPriceGwei: null, baseFeeGwei: null, blockTimestamp: null };

/** Reads gas price and the latest block header from the healthiest node. */
async function readChainStats(fastest: RpcProbe | null): Promise<ChainStats> {
  if (!fastest) return EMPTY_STATS;

  const rpc = getMonitoredRpc(fastest.id);
  if (!rpc) return EMPTY_STATS;

  const client = getRpcClient(rpc, STATS_REQUEST_TIMEOUT_MS);

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

/* -------------------------------------------------------------------------- *
 * 4. Pulse assembly
 * -------------------------------------------------------------------------- */

async function collectPulse(): Promise<PulseSnapshot> {
  const startedAt = performance.now();

  const probed = await probeAllRpcs();
  const highestNetworkBlock = findHighestNetworkBlock(probed);
  const { rpcs, outOfSyncRpcIds, errors: driftErrors } = applyDriftDetection(
    probed,
    highestNetworkBlock,
  );

  const fastest = pickFastestHealthy(rpcs);
  const stats = await readChainStats(fastest);

  const offlineErrors = rpcs
    .filter((rpc) => rpc.status === "offline" && rpc.error)
    .map((rpc) => `${rpc.name}: ${rpc.error}`);

  const point: PulseHistoryPoint = {
    t: Date.now(),
    highestNetworkBlock,
    gasPriceGwei: stats.gasPriceGwei,
    latencies: Object.fromEntries(rpcs.map((rpc) => [rpc.id, rpc.latencyMs])),
    statuses: Object.fromEntries(rpcs.map((rpc) => [rpc.id, rpc.status])),
    drifts: Object.fromEntries(rpcs.map((rpc) => [rpc.id, rpc.drift])),
  };

  await recordPulseSample(point);

  const stored = await readPulseHistory();
  const history = stored.some((entry) => entry.t === point.t) ? stored : [...stored, point];

  return {
    ok: rpcs.some((rpc) => rpc.status !== "offline"),
    checkedAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - startedAt),
    highestNetworkBlock,
    gasPriceGwei: stats.gasPriceGwei,
    baseFeeGwei: stats.baseFeeGwei,
    blockTimestamp: stats.blockTimestamp,
    driftThreshold: DRIFT_THRESHOLD,
    fastestRpcId: fastest?.id ?? null,
    outOfSyncRpcIds,
    rpcs,
    history,
    errors: [...offlineErrors, ...driftErrors],
  };
}

/** Degraded-but-valid payload for when the pipeline misses its deadline. */
async function timeoutPulse(startedAt: number): Promise<PulseSnapshot> {
  const reason = `No pulse within the ${SERVER_DEADLINE_MS / 1000}s server budget`;
  const history = (await safeCall(() => readPulseHistory())) ?? [];

  return {
    ...createEmptySnapshot(reason, Math.round(performance.now() - startedAt)),
    history,
  };
}

/* -------------------------------------------------------------------------- *
 * 5. HTTP handler
 * -------------------------------------------------------------------------- */

/**
 * GET /api/pulse
 *
 * Network monitoring engine for the Electroneum Smart Chain:
 *   1. pings every RPC and reads its block number concurrently,
 *   2. computes highestNetworkBlock and validates each node's sync drift,
 *   3. reads the gas price (Gwei) and records the sample for history,
 *   4. returns the documented payload — always, within the server budget.
 *
 * Response shape:
 *   {
 *     highestNetworkBlock: 15806500,
 *     gasPriceGwei: "0.001",
 *     rpcs: [
 *       { name: "Official", latencyMs: 120, blockNumber: 15806500, drift: 0, status: "healthy" },
 *       { name: "Ankr", latencyMs: 45, blockNumber: 15806490, drift: 10, status: "degraded",
 *         error: "Out of sync by 10 blocks" }
 *     ]
 *   }
 */
export async function GET() {
  const servedAt = new Date().toISOString();
  const startedAt = performance.now();

  try {
    const snapshot = await withDeadline(collectPulse, () => timeoutPulse(startedAt));

    return NextResponse.json(
      { ...snapshot, chainId: ETN_CHAIN_ID, servedAt },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": NO_STORE,
          "X-Pulse-Ok": String(snapshot.ok),
        },
      },
    );
  } catch (error) {
    // A monitoring endpoint is still a health signal when it fails: answer with
    // the exact same snapshot shape so pollers can render it instead of crashing.
    const detail = describeError(error);

    return NextResponse.json(
      {
        ...createEmptySnapshot("Pulse engine failure", Math.round(performance.now() - startedAt)),
        error: "Pulse engine failure",
        detail,
        chainId: ETN_CHAIN_ID,
        servedAt,
      },
      {
        status: 503,
        headers: {
          ...CORS_HEADERS,
          "Cache-Control": NO_STORE,
          "X-Pulse-Ok": "false",
        },
      },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS } });
}
