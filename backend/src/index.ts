import type { Server } from "node:http";

import { loadConfig } from "./config.js";
import { ETN_CHAIN_ID, MONITORED_RPCS } from "./etn.js";
import { createWorkerStatus, runWorker } from "./poller.js";
import { describeError } from "./rpc.js";
import { DEFAULT_PORT, startHealthServer } from "./server.js";
import { createHeadlessClient } from "./supabase.js";

/**
 * ETN Pulse backend entry point.
 *
 * Render (and Koyeb, and most PaaS) runs this worker as a *web* service, so the
 * process has to do two things at once: serve HTTP on the injected port so the
 * platform's health check passes, and keep the 5s RPC polling loop running for
 * as long as the process lives. Both live in the same process — the loop is I/O
 * bound and the server is a couple of kilobytes of routing, so a second dyno
 * would buy nothing.
 *
 * The server comes up first on purpose. A first cycle can take a few seconds
 * (a cold viem round trip to both endpoints plus the block/gas read), and a
 * health check that arrives before the port is bound would mark a healthy
 * deploy as failed.
 *
 * `npm run once` skips the server entirely: a single cycle needs no port, which
 * keeps cron and smoke-test usage exactly as it was.
 */

/**
 * Render and Koyeb assign PORT dynamically and expect the app to honour it. The
 * fallback keeps local runs working without any configuration.
 */
function readPort(): number {
  const raw = process.env.PORT?.trim();
  if (!raw) return DEFAULT_PORT;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(`[pulse] PORT="${raw}" is not a usable port — using ${DEFAULT_PORT}`);
    return DEFAULT_PORT;
  }
  return parsed;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const client = config.supabase ? createHeadlessClient(config.supabase) : null;
  const status = createWorkerStatus(config);

  console.log(`[pulse] ETN Pulse worker — chain ${ETN_CHAIN_ID}`);
  console.log(
    `[pulse] endpoints: ${MONITORED_RPCS.map((rpc) => `${rpc.name} (${rpc.url})`).join(", ")}`,
  );
  console.log(
    `[pulse] interval=${config.intervalMs}ms driftThreshold=${config.driftThreshold} ` +
      `supabase=${config.supabase ? config.supabase.table : "disabled"} ` +
      `discord=${config.discordWebhookUrl ? "enabled" : "disabled"} ` +
      `wss=${config.wssUrl ?? "disabled"}`,
  );

  const controller = new AbortController();
  let server: Server | null = null;
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[pulse] ${signal} received — finishing the current cycle, then exiting.`);
    controller.abort();

    if (!server) return;
    // Stop accepting connections, and drop the idle keep-alive sockets the
    // platform's proxy is holding so the stop signal does not leave us hanging.
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
      server?.closeIdleConnections();
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    console.error(`[pulse] unhandled rejection: ${describeError(reason)}`);
  });

  if (!config.runOnce) {
    const port = readPort();
    server = await startHealthServer({ port, status });
    console.log(`[pulse] web service listening on 0.0.0.0:${port} — health: GET / or GET /health`);

    // Render injects the service's public URL. Logging it keeps the deployed
    // address discoverable, and it is the URL an external uptime check should
    // target to stop the free instance type from idling out.
    const publicUrl = process.env.RENDER_EXTERNAL_URL?.trim();
    if (publicUrl) {
      console.log(
        `[pulse] public URL: ${publicUrl} — point a keep-alive check at ${publicUrl}/health`,
      );
    }
  }

  await runWorker({ config, client, status, signal: controller.signal });
}

main().catch((error: unknown) => {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  const detail =
    code === "EADDRINUSE"
      ? `port ${readPort()} is already in use — set PORT to a free port, or stop the process holding it`
      : describeError(error);
  console.error(`[pulse] fatal: ${detail}`);
  process.exitCode = 1;
});
