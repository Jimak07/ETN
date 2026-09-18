import { HISTORY_LIMIT } from "./etn";
import type { PulseHistoryPoint, PulseSnapshot, RpcStatus } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** How long a single poll waits before it is abandoned and retried. */
export const PULSE_CLIENT_TIMEOUT_MS = 8000;

export type PulseRequestErrorKind = "timeout" | "offline" | "http" | "malformed" | "aborted";

export class PulseRequestError extends Error {
  readonly kind: PulseRequestErrorKind;

  constructor(kind: PulseRequestErrorKind, message: string) {
    super(message);
    this.name = "PulseRequestError";
    this.kind = kind;
  }
}

/** A payload is usable when it carries the documented snapshot fields. */
function isSnapshotPayload(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.checkedAt === "string" &&
    Array.isArray(value.rpcs) &&
    Array.isArray(value.history)
  );
}

/**
 * Fetch a pulse snapshot from the monitoring engine.
 *
 * The request carries its own deadline: if the engine stalls (cold compile,
 * slow RPC, dead database) the poll fails fast with a classified error instead
 * of leaving the dashboard stuck on "connecting" forever.
 */
export async function fetchPulse(
  signal?: AbortSignal,
  timeoutMs: number = PULSE_CLIENT_TIMEOUT_MS,
): Promise<PulseSnapshot> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort);

  try {
    const response = await fetch("/api/pulse", {
      signal: controller.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        isRecord(payload) && typeof payload.detail === "string"
          ? payload.detail
          : isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : `Pulse API responded with ${response.status}`;
      throw new PulseRequestError("http", detail);
    }

    if (!isSnapshotPayload(payload)) {
      throw new PulseRequestError("malformed", "Malformed pulse payload received");
    }

    return payload as unknown as PulseSnapshot;
  } catch (caught) {
    if (caught instanceof PulseRequestError) throw caught;
    if (signal?.aborted) {
      throw new PulseRequestError("aborted", "Polling cancelled");
    }
    if (timedOut) {
      throw new PulseRequestError(
        "timeout",
        `Monitoring engine did not answer within ${(timeoutMs / 1000).toFixed(1)}s`,
      );
    }
    throw new PulseRequestError("offline", "Could not reach the monitoring engine (/api/pulse)");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

export interface LatencySeriesPoint {
  t: number;
  /** HH:MM:SS label for the chart tooltip. */
  label: string;
  latencyMs: number | null;
  status: RpcStatus | null;
}

/** Project the history window onto a single RPC for the sparkline. */
export function buildLatencySeries(
  history: PulseHistoryPoint[],
  rpcId: string | null,
): LatencySeriesPoint[] {
  if (!rpcId) return [];

  return history.map((point) => ({
    t: point.t,
    label: new Date(point.t).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    latencyMs: point.latencies[rpcId] ?? null,
    status: point.statuses[rpcId] ?? null,
  }));
}

/** Merge server history with locally polled samples, oldest first. */
export function mergeHistorySeries(
  previous: PulseHistoryPoint[],
  incoming: PulseHistoryPoint[],
): PulseHistoryPoint[] {
  const byTimestamp = new Map<number, PulseHistoryPoint>();
  for (const point of [...previous, ...incoming]) {
    byTimestamp.set(point.t, point);
  }
  return [...byTimestamp.values()].sort((a, b) => a.t - b.t).slice(-HISTORY_LIMIT);
}

export interface LatencySummary {
  latest: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  samples: number;
}

export function summarizeLatency(series: LatencySeriesPoint[]): LatencySummary {
  const values = series
    .map((point) => point.latencyMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (values.length === 0) {
    return { latest: null, min: null, max: null, avg: null, samples: 0 };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    latest: values[values.length - 1] ?? null,
    min: Math.min(...values),
    max: Math.max(...values),
    avg: total / values.length,
    samples: values.length,
  };
}
