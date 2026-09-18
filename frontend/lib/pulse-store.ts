import { HISTORY_LIMIT } from "./etn";
import type { PulseHistoryPoint, RpcStatus } from "./types";

/**
 * Persistence boundary for pulse samples.
 *
 * The monitoring engine only ever talks to this interface, so swapping the
 * in-memory ring buffer for Supabase (or Timescale, ClickHouse, ...) is a
 * one-line change in `getPulseStore()`.
 */
export interface PulseStore {
  readonly kind: "memory" | "supabase";
  record(point: PulseHistoryPoint): Promise<void>;
  recent(limit: number): Promise<PulseHistoryPoint[]>;
}

/** Samples kept in memory: a few times the window we actually serve. */
const MEMORY_CAPACITY = HISTORY_LIMIT * 4;

/**
 * Remote logging is best-effort: a slow database must never delay the pulse
 * response, so every Supabase call carries its own deadline.
 */
const SUPABASE_TIMEOUT_MS = 1500;

function timeoutSignal(ms: number): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
}

class MemoryPulseStore implements PulseStore {
  readonly kind = "memory" as const;
  private points: PulseHistoryPoint[] = [];

  async record(point: PulseHistoryPoint): Promise<void> {
    this.points.push(point);
    if (this.points.length > MEMORY_CAPACITY) {
      this.points.splice(0, this.points.length - MEMORY_CAPACITY);
    }
  }

  async recent(limit: number): Promise<PulseHistoryPoint[]> {
    return this.points.slice(-limit);
  }
}

interface SupabasePulseRow {
  t: number | string;
  highest_network_block: number | string | null;
  gas_price_gwei: number | string | null;
  latencies: Record<string, number | null> | null;
  statuses: Record<string, RpcStatus> | null;
  drifts: Record<string, number | null> | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Postgres numeric arrives as a string; keep it exact and trim zero padding. */
function normalizeDecimal(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const raw = typeof value === "string" ? value : String(value);
  return raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
}

/**
 * Thin PostgREST client (no SDK dependency required).
 *
 * Schema: see `../supabase/schema.sql`. Writes use `Prefer: return=minimal` so a
 * successful insert costs nothing extra on the wire.
 */
class SupabasePulseStore implements PulseStore {
  readonly kind = "supabase" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly table: string,
  ) {}

  private get endpoint(): string {
    return `${this.baseUrl.replace(/\/+$/, "")}/rest/v1/${this.table}`;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      apikey: this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private toRow(point: PulseHistoryPoint) {
    return {
      t: point.t,
      highest_network_block: point.highestNetworkBlock,
      gas_price_gwei: point.gasPriceGwei,
      latencies: point.latencies,
      statuses: point.statuses,
      drifts: point.drifts,
    };
  }

  private fromRow(row: SupabasePulseRow): PulseHistoryPoint {
    return {
      t: toNumber(row.t) ?? 0,
      highestNetworkBlock: toNumber(row.highest_network_block),
      gasPriceGwei: normalizeDecimal(row.gas_price_gwei),
      latencies: row.latencies ?? {},
      statuses: row.statuses ?? {},
      drifts: row.drifts ?? {},
    };
  }

  async record(point: PulseHistoryPoint): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers({ Prefer: "return=minimal" }),
      body: JSON.stringify(this.toRow(point)),
      cache: "no-store",
      signal: timeoutSignal(SUPABASE_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Supabase insert failed with ${response.status}`);
    }
  }

  async recent(limit: number): Promise<PulseHistoryPoint[]> {
    const query = new URLSearchParams({
      select: "t,highest_network_block,gas_price_gwei,latencies,statuses,drifts",
      order: "t.desc",
      limit: String(limit),
    });

    const response = await fetch(`${this.endpoint}?${query.toString()}`, {
      headers: this.headers(),
      cache: "no-store",
      signal: timeoutSignal(SUPABASE_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Supabase select failed with ${response.status}`);
    }

    const rows = (await response.json()) as SupabasePulseRow[];
    return rows.map((row) => this.fromRow(row)).reverse();
  }
}

interface PulseGlobalCache {
  memory?: MemoryPulseStore;
  supabase?: SupabasePulseStore;
}

// Next.js hot reload (and serverless warm starts) reuse the module graph, so we
// keep the stores on globalThis to avoid dropping samples between requests.
const globalCache = globalThis as typeof globalThis & { __etnPulseStore?: PulseGlobalCache };
globalCache.__etnPulseStore ??= {};
const cache = globalCache.__etnPulseStore;

function memoryStore(): MemoryPulseStore {
  cache.memory ??= new MemoryPulseStore();
  return cache.memory;
}

/** Returns the Supabase-backed store when configured, otherwise memory. */
export function getPulseStore(): PulseStore {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!url || !key) return memoryStore();

  cache.supabase ??= new SupabasePulseStore(
    url,
    key,
    process.env.SUPABASE_PULSE_TABLE ?? "pulse_samples",
  );
  return cache.supabase;
}

/**
 * Persist a sample. Telemetry logging must never break the public API, so
 * failures are logged and swallowed.
 */
export async function recordPulseSample(point: PulseHistoryPoint): Promise<void> {
  const store = getPulseStore();
  try {
    await store.record(point);
  } catch (error) {
    console.warn("[pulse-store] failed to record sample:", describeError(error));
  }
}

/**
 * Read the rolling window. Falls back to the in-memory buffer when the remote
 * store is unavailable so the dashboard still renders a sparkline.
 */
export async function readPulseHistory(
  limit: number = HISTORY_LIMIT,
): Promise<PulseHistoryPoint[]> {
  const store = getPulseStore();

  if (store.kind === "memory") return store.recent(limit);

  try {
    return await store.recent(limit);
  } catch (error) {
    console.warn("[pulse-store] falling back to memory history:", describeError(error));
    return memoryStore().recent(limit);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
