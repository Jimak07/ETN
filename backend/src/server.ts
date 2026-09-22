import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import type { WorkerStatus } from "./poller.js";

/**
 * Koyeb (like most PaaS) runs this worker as a *web* service, so the process
 * must expose an HTTP port even though its real job is the polling loop in
 * `poller.ts`. The server is deliberately small: `node:http` only, no framework,
 * and the only shared state is a read-only view of the worker's status.
 *
 *   GET /        liveness  -> the exact payload the platform health check wants
 *   GET /health  readiness -> the same, plus the worker's counters
 */

/** Koyeb injects PORT at runtime; 10000 matches its own default. */
export const DEFAULT_PORT = 10000;

/**
 * Bind every interface. A PaaS proxy reaches the container from outside, so
 * listening on 127.0.0.1 would make the platform's health check fail with 502.
 */
export const DEFAULT_HOST = "0.0.0.0";

const ALLOWED_METHODS = "GET, HEAD";

export interface HealthServerOptions {
  port: number;
  host?: string;
  /** Live worker state, read per request; never cached. */
  status: WorkerStatus;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
  headOnly: boolean,
  extraHeaders: Record<string, string> = {},
): void {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  // A HEAD response carries GET's headers but no body.
  res.end(headOnly ? undefined : body);
}

/**
 * Route key for a request: query strings are ignored (this API takes no
 * parameters) and a trailing slash is folded, so `/health` and `/health/` are
 * the same route.
 */
function routeOf(req: IncomingMessage): string {
  const path = (req.url ?? "/").split("?")[0] ?? "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : "/";
}

/** Wire form of the worker status: epoch milliseconds become ISO strings. */
function renderHealth(status: WorkerStatus) {
  return {
    status: "ETN Pulse Backend Active",
    chainId: status.chainId,
    startedAt: new Date(status.startedAt).toISOString(),
    uptimeSeconds: Math.max(0, Math.round((Date.now() - status.startedAt) / 1000)),
    pollIntervalMs: status.pollIntervalMs,
    cycles: status.cycles,
    lastCycleAt: status.lastCycleAt === null ? null : new Date(status.lastCycleAt).toISOString(),
    lastCycleDurationMs: status.lastCycleDurationMs,
    lastCycleError: status.lastCycleError,
    highestNetworkBlock: status.highestNetworkBlock,
    gasPriceGwei: status.gasPriceGwei,
    outOfSyncRpcIds: status.outOfSyncRpcIds,
    rpcs: status.rpcs.map((rpc) => ({
      id: rpc.id,
      name: rpc.name,
      status: rpc.status,
      latencyMs: rpc.latencyMs,
      blockNumber: rpc.blockNumber,
      drift: rpc.drift,
    })),
  };
}

/**
 * Start the web service.
 *
 * Resolves once the port is actually bound, so the caller logs a listening
 * address only after a real bind and turns a port clash into a clear fatal
 * error instead of a silent half-started process.
 */
export function startHealthServer({
  port,
  host = DEFAULT_HOST,
  status,
}: HealthServerOptions): Promise<Server> {
  const server = createServer((req, res) => {
    try {
      const headOnly = req.method === "HEAD";
      if (req.method !== "GET" && !headOnly) {
        sendJson(res, 405, { error: "Method not allowed" }, false, { Allow: ALLOWED_METHODS });
        return;
      }

      switch (routeOf(req)) {
        case "/":
          sendJson(res, 200, { status: "ETN Pulse Backend Active" }, headOnly);
          return;
        case "/health":
        case "/healthz":
          sendJson(res, 200, renderHealth(status), headOnly);
          return;
        default:
          sendJson(res, 404, { error: "Not found", routes: ["/", "/health"] }, headOnly);
          return;
      }
    } catch (error) {
      // A bad request must never take the monitoring loop down with it.
      console.error(`[http] request failed: ${describeError(error)}`);
      if (res.headersSent) res.end();
      else sendJson(res, 500, { error: "Internal server error" }, false);
    }
  });

  return new Promise<Server>((resolve, reject) => {
    const onBindError = (error: Error) => reject(error);
    server.once("error", onBindError);

    server.listen(port, host, () => {
      server.removeListener("error", onBindError);
      server.on("error", (error: Error) => console.error(`[http] server error: ${error.message}`));
      resolve(server);
    });
  });
}
