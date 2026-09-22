import type { WorkerConfig } from "./config.js";
import { applyDriftDetection, findHighestNetworkBlock } from "./drift.js";
import { ETN_CHAIN_ID, MONITORED_RPCS } from "./etn.js";
import { detectTransitions, sendDiscordAlerts } from "./notify.js";
import { describeError, pickFastest, probeAllRpcs, readChainStats } from "./rpc.js";
import { insertSample, type HeadlessClient } from "./supabase.js";
import type { PulseSample, RpcProbe } from "./types.js";

/**
 * ETN Pulse polling loop.
 *
 * An independent loop that polls the Electroneum Smart Chain RPCs every
 * POLL_INTERVAL_MS, measures endpoint latency and block drift, persists each
 * sample to Supabase with a headless client, and raises Discord alerts when a
 * node changes state.
 *
 * It is deliberately decoupled from the Next.js frontend: it keeps collecting
 * history even while the dashboard is down or being redeployed, and the two can
 * be scaled, deployed and restarted independently.
 *
 * This module owns the loop; `src/index.ts` is the entry point and pairs it
 * with the HTTP server the hosting platform health-checks.
 *
 * Usage:
 *   npm run dev     # tsx watch, reloads on change
 *   npm run build   # tsc -> dist/
 *   npm start       # node dist/index.js
 *   npm run once    # a single cycle, then exit (cron / smoke test)
 */

interface CycleResult {
  rpcs: RpcProbe[];
  sample: PulseSample;
  highestNetworkBlock: number | null;
  outOfSyncRpcIds: string[];
  durationMs: number;
}

function formatProbe(rpc: RpcProbe): string {
  const latency = rpc.latencyMs === null ? "—" : `${rpc.latencyMs}ms`;
  const block = rpc.blockNumber === null ? "—" : String(rpc.blockNumber);
  const drift = rpc.drift === null ? "—" : `+${rpc.drift}`;
  const note = rpc.error ? ` (${rpc.error})` : "";
  return `${rpc.name} ${latency} ${rpc.status} block=${block} drift=${drift}${note}`;
}

/** Sleeps, but wakes immediately when the worker is asked to shut down. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function runCycle(
  cycle: number,
  config: WorkerConfig,
  client: HeadlessClient | null,
  previous: ReadonlyMap<string, RpcProbe>,
): Promise<CycleResult> {
  const startedAt = performance.now();

  // 1. Parallel probe: one offline node must never hang the cycle.
  const probed = await probeAllRpcs(
    MONITORED_RPCS,
    config.requestTimeoutMs,
    config.latencyThresholdMs,
  );

  // 2. Synchronisation validation against the highest block on the network.
  const highestNetworkBlock = findHighestNetworkBlock(probed);
  const { rpcs, outOfSyncRpcIds } = applyDriftDetection(
    probed,
    highestNetworkBlock,
    config.driftThreshold,
  );

  // 3. Gas price from the healthiest node that answered.
  const fastest = pickFastest(rpcs);
  const fastestRpc = fastest ? (MONITORED_RPCS.find((rpc) => rpc.id === fastest.id) ?? null) : null;
  const stats = await readChainStats(fastestRpc, config.requestTimeoutMs);

  const sample: PulseSample = {
    t: Date.now(),
    highestNetworkBlock,
    gasPriceGwei: stats.gasPriceGwei,
    latencies: Object.fromEntries(rpcs.map((rpc) => [rpc.id, rpc.latencyMs])),
    statuses: Object.fromEntries(rpcs.map((rpc) => [rpc.id, rpc.status])),
    drifts: Object.fromEntries(rpcs.map((rpc) => [rpc.id, rpc.drift])),
  };

  // 4. Persist. A database outage must not stop monitoring, so failures are
  //    reported and the loop carries on with the next cycle.
  if (client && config.supabase) {
    try {
      await insertSample(client, config.supabase.table, sample);
    } catch (error) {
      console.error(`[pulse] persist failed: ${describeError(error)}`);
    }
  }

  // 5. Alert on state transitions only.
  const events = detectTransitions(previous, rpcs, config.driftThreshold);
  for (const event of events) {
    console.log(`[alert] ${event.level.toUpperCase()} ${event.title} — ${event.detail}`);
  }
  if (config.discordWebhookUrl && events.length > 0) {
    try {
      await sendDiscordAlerts(config.discordWebhookUrl, events, { highestNetworkBlock, cycle });
    } catch (error) {
      console.error(`[pulse] discord alert failed: ${describeError(error)}`);
    }
  }

  const durationMs = Math.round(performance.now() - startedAt);
  console.log(
    `[pulse] #${cycle} block=${highestNetworkBlock ?? "—"} gas=${stats.gasPriceGwei ?? "—"} Gwei ` +
      `in ${durationMs}ms | ${rpcs.map(formatProbe).join(" | ")}`,
  );
  if (outOfSyncRpcIds.length > 0) {
    console.warn(`[pulse] out of sync: ${outOfSyncRpcIds.join(", ")}`);
  }

  return { rpcs, sample, highestNetworkBlock, outOfSyncRpcIds, durationMs };
}

/**
 * Live worker state.
 *
 * Mutated in place by `runWorker` and read on every request by the HTTP server.
 * It is a plain object on purpose: the loop is the only writer and the server
 * only reads, so neither needs a reference to the other.
 */
export interface WorkerStatus {
  /** Epoch ms when this process started. */
  startedAt: number;
  /** Cycles attempted, including the ones that threw. */
  cycles: number;
  /** Epoch ms of the last cycle to settle, successful or not. */
  lastCycleAt: number | null;
  lastCycleDurationMs: number | null;
  /** Message from the last failed cycle; cleared once a cycle succeeds. */
  lastCycleError: string | null;
  highestNetworkBlock: number | null;
  gasPriceGwei: string | null;
  outOfSyncRpcIds: string[];
  /** Last probe result per endpoint, surfaced by `/health`. */
  rpcs: RpcProbe[];
  pollIntervalMs: number;
  chainId: number;
}

export function createWorkerStatus(config: WorkerConfig): WorkerStatus {
  return {
    startedAt: Date.now(),
    cycles: 0,
    lastCycleAt: null,
    lastCycleDurationMs: null,
    lastCycleError: null,
    highestNetworkBlock: null,
    gasPriceGwei: null,
    outOfSyncRpcIds: [],
    rpcs: [],
    pollIntervalMs: config.intervalMs,
    chainId: ETN_CHAIN_ID,
  };
}

export interface WorkerRunOptions {
  config: WorkerConfig;
  /** null when Supabase is not configured; samples are then logged only. */
  client: HeadlessClient | null;
  /** Mutated in place so the HTTP server can report progress. */
  status: WorkerStatus;
  /** Aborting stops the loop after the cycle already in flight. */
  signal: AbortSignal;
}

/**
 * Run the polling loop until `signal` is aborted.
 *
 * A failed cycle is a data point, not a crash: it is recorded on `status`,
 * logged, and the loop waits for the next interval. The returned promise
 * resolves once the loop exits, so the entry point can await a clean shutdown.
 */
export async function runWorker({
  config,
  client,
  status,
  signal,
}: WorkerRunOptions): Promise<number> {
  let cycle = 0;
  let previous = new Map<string, RpcProbe>();

  while (!signal.aborted) {
    cycle += 1;
    try {
      const result = await runCycle(cycle, config, client, previous);
      previous = new Map(result.rpcs.map((rpc) => [rpc.id, rpc]));

      status.cycles = cycle;
      status.lastCycleAt = Date.now();
      status.lastCycleDurationMs = result.durationMs;
      status.lastCycleError = null;
      status.highestNetworkBlock = result.highestNetworkBlock;
      status.gasPriceGwei = result.sample.gasPriceGwei;
      status.outOfSyncRpcIds = result.outOfSyncRpcIds;
      status.rpcs = result.rpcs;
    } catch (error) {
      const detail = describeError(error);
      status.cycles = cycle;
      status.lastCycleAt = Date.now();
      status.lastCycleError = detail;
      console.error(`[pulse] cycle #${cycle} failed: ${detail}`);
    }

    if (config.runOnce || signal.aborted) break;
    await delay(config.intervalMs, signal);
  }

  console.log(`[pulse] worker stopped after ${cycle} cycle(s).`);
  return cycle;
}
