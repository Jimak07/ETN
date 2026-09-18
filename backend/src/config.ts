import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

import {
  DRIFT_THRESHOLD,
  LATENCY_THRESHOLD_MS,
  POLL_INTERVAL_MS,
  RPC_REQUEST_TIMEOUT_MS,
} from "./etn.js";

// Resolve `.env` relative to this package (works from `src/` under tsx and from
// `dist/` after a build) and also honour a `.env` in the current directory, so
// `npm start --prefix backend` and a plain `node backend/dist/poller.js` from
// the repo root both pick up the same secrets.
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const envPath of [resolve(packageRoot, ".env"), resolve(process.cwd(), ".env")]) {
  loadDotenv({ path: envPath, override: false });
}

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  table: string;
}

export interface WorkerConfig {
  intervalMs: number;
  driftThreshold: number;
  latencyThresholdMs: number;
  requestTimeoutMs: number;
  /** null when Supabase is not configured; the worker then logs to stdout only. */
  supabase: SupabaseConfig | null;
  discordWebhookUrl: string | null;
  /** `--once` runs a single cycle and exits (useful for cron and smoke tests). */
  runOnce: boolean;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[config] ${name}="${raw}" is not a positive integer — using ${fallback}`);
    return fallback;
  }
  return parsed;
}

function readOptional(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw ? raw : null;
}

export function loadConfig(argv: readonly string[] = process.argv.slice(2)): WorkerConfig {
  const url = readOptional("SUPABASE_URL");
  const serviceRoleKey = readOptional("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    console.warn(
      "[config] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — samples will be " +
        "logged to stdout instead of persisted. Copy .env.example to .env to enable logging.",
    );
  }

  return {
    intervalMs: readPositiveInt("POLL_INTERVAL_MS", POLL_INTERVAL_MS),
    driftThreshold: readPositiveInt("DRIFT_THRESHOLD", DRIFT_THRESHOLD),
    latencyThresholdMs: readPositiveInt("LATENCY_THRESHOLD_MS", LATENCY_THRESHOLD_MS),
    requestTimeoutMs: readPositiveInt("RPC_REQUEST_TIMEOUT_MS", RPC_REQUEST_TIMEOUT_MS),
    supabase:
      url && serviceRoleKey
        ? { url, serviceRoleKey, table: readOptional("SUPABASE_PULSE_TABLE") ?? "pulse_samples" }
        : null,
    discordWebhookUrl: readOptional("DISCORD_WEBHOOK_URL"),
    runOnce: argv.includes("--once"),
  };
}
