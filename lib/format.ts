import { LATENCY_BAR_MAX_MS, LATENCY_THRESHOLD_MS } from "./etn";
import type { RpcStatus } from "./types";

const numberFormatter = new Intl.NumberFormat("en-US");

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return numberFormatter.format(Math.round(value));
}

export function formatGwei(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function formatLatency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}`;
}

export function statusLabel(status: RpcStatus): string {
  if (status === "healthy") return "Healthy";
  if (status === "degraded") return "Degraded";
  return "Offline";
}

/** Percentage width of a latency bar, clamped so tiny values stay visible. */
export function latencyBarWidth(latencyMs: number | null | undefined): number {
  if (latencyMs === null || latencyMs === undefined || !Number.isFinite(latencyMs)) return 100;
  const ratio = (latencyMs / LATENCY_BAR_MAX_MS) * 100;
  return Math.min(100, Math.max(4, ratio));
}

export function latencyAccent(status: RpcStatus): string {
  if (status === "healthy") return "bg-status-healthy";
  if (status === "degraded") return "bg-status-degraded";
  return "bg-status-offline";
}

/** Parse a decimal string such as "0.001" into a number for display. */
export function parseDecimalString(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Gas price formatting with magnitude-aware precision: ETN-SC fees can sit
 * below 1 Gwei, where a fixed two decimals would render a misleading "0.00".
 */
export function formatGasPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(3);
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatDrift(drift: number | null | undefined): string {
  if (drift === null || drift === undefined || !Number.isFinite(drift)) return "—";
  return drift === 0 ? "0" : `+${drift}`;
}

/** Sync tone: emerald while within the drift threshold, amber once it slips. */
export function driftTone(drift: number | null | undefined, threshold: number): string {
  if (drift === null || drift === undefined) return "text-slate-500";
  return drift > threshold ? "text-status-degraded" : "text-status-healthy";
}

export function isHealthy(latencyMs: number | null | undefined): boolean {
  return typeof latencyMs === "number" && latencyMs < LATENCY_THRESHOLD_MS;
}

export function formatRelativeTime(timestamp: number | null, now: number = Date.now()): string {
  if (!timestamp) return "waiting for first pulse";
  const deltaSeconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (deltaSeconds < 2) return "just now";
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/** `https://rpc.electroneum.com` -> `rpc.electroneum.com` */
export function rpcHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function formatBlockAge(blockTimestamp: number | null, now: number = Date.now()): string {
  if (!blockTimestamp) return "—";
  const deltaSeconds = Math.max(0, Math.round(now / 1000 - blockTimestamp));
  if (deltaSeconds < 60) return `${deltaSeconds}s old`;
  return `${Math.floor(deltaSeconds / 60)}m old`;
}
