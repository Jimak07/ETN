import { loadConfig, type WorkerConfig } from "./config.js";
import { applyDriftDetection, findHighestNetworkBlock } from "./drift.js";
import { ETN_CHAIN_ID, MONITORED_RPCS } from "./etn.js";
import { detectTransitions, sendDiscordAlerts } from "./notify.js";
import { describeError, pickFastest, probeAllRpcs, readChainStats } from "./rpc.js";
import { createHeadlessClient, insertSample, type HeadlessClient } from "./supabase.js";
import type { PulseSample, RpcProbe } from "./types.js";

/**
 * ETN Pulse backend worker.
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
 * Usage:
 *   npm run dev     # tsx watch, reloads on change
 *   npm run build   # tsc -> dist/
 *   npm start       # node dist/poller.js
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

async function main(): Promise<void> {
  const config = loadConfig();
  const client = config.supabase ? createHeadlessClient(config.supabase) : null;

  console.log(`[pulse] ETN Pulse worker — chain ${ETN_CHAIN_ID}`);
  console.log(
    `[pulse] endpoints: ${MONITORED_RPCS.map((rpc) => `${rpc.name} (${rpc.url})`).join(", ")}`,
  );
  console.log(
    `[pulse] interval=${config.intervalMs}ms driftThreshold=${config.driftThreshold} ` +
      `supabase=${config.supabase ? config.supabase.table : "disabled"} ` +
      `discord=${config.discordWebhookUrl ? "enabled" : "disabled"}`,
  );

  const controller = new AbortController();
  const shutdown = (signal: string) => {
    if (controller.signal.aborted) return;
    console.log(`[pulse] ${signal} received — finishing the current cycle, then exiting.`);
    controller.abort();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    console.error(`[pulse] unhandled rejection: ${describeError(reason)}`);
  });

  let cycle = 0;
  let previous = new Map<string, RpcProbe>();

  while (!controller.signal.aborted) {
    cycle += 1;
    try {
      const result = await runCycle(cycle, config, client, previous);
      previous = new Map(result.rpcs.map((rpc) => [rpc.id, rpc]));
    } catch (error) {
      // A failed cycle is a data point, not a crash: log it and retry.
      console.error(`[pulse] cycle #${cycle} failed: ${describeError(error)}`);
    }

    if (config.runOnce || controller.signal.aborted) break;
    await delay(config.intervalMs, controller.signal);
  }

  console.log(`[pulse] worker stopped after ${cycle} cycle(s).`);
}

main().catch((error: unknown) => {
  console.error(`[pulse] fatal: ${describeError(error)}`);
  process.exitCode = 1;
});
