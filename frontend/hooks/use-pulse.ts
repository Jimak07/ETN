"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { POLL_INTERVAL_MS } from "@/lib/etn";
import { PulseRequestError, fetchPulse, mergeHistorySeries } from "@/lib/pulse-client";
import type { PulseConnection, PulseHistoryPoint, PulseSnapshot } from "@/lib/types";

/** Faster cadence while polls are failing, so the dashboard recovers quickly. */
const RETRY_INTERVAL_MS = 2000;

/**
 * A pulse older than this counts as stale, and only then does the UI surface
 * its age. Three missed cycles at the default cadence.
 */
export const STALE_AFTER_MS = POLL_INTERVAL_MS * 3;

export interface UsePulseResult {
  snapshot: PulseSnapshot | null;
  history: PulseHistoryPoint[];
  connection: PulseConnection;
  error: string | null;
  lastUpdated: number | null;
  /** True only until the first response (success *or* failure) lands. */
  isLoading: boolean;
  /** True while a request is actually in flight — drives the refresh spinner. */
  isFetching: boolean;
  /** True when there is no successful pulse yet, or the last one is too old. */
  isStale: boolean;
  /** Age of the last successful pulse in ms; null until the first success. */
  pulseAgeMs: number | null;
  /** Milliseconds spent waiting for that first response. */
  elapsedMs: number;
  refresh: () => void;
}

/**
 * Polls `/api/pulse` on a fixed cadence.
 *
 * Guarantees that matter for the dashboard:
 * - the first request always fires, even if a previous effect instance
 *   (React StrictMode / Fast Refresh) was torn down mid-flight,
 * - every request is bounded by `fetchPulse`'s timeout, so the UI can never sit
 *   on "connecting" indefinitely,
 * - overlapping polls are dropped and the last good snapshot is retained when a
 *   poll fails.
 */
export function usePulse(intervalMs: number = POLL_INTERVAL_MS): UsePulseResult {
  const [snapshot, setSnapshot] = useState<PulseSnapshot | null>(null);
  const [history, setHistory] = useState<PulseHistoryPoint[]>([]);
  const [connection, setConnection] = useState<PulseConnection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [attempt, setAttempt] = useState(0);

  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const failedRef = useRef(false);
  const startedAtRef = useRef(Date.now());

  const load = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    if (signal?.aborted) return false;
    if (fetchingRef.current) return false;

    fetchingRef.current = true;
    setIsFetching(true);

    try {
      const next = await fetchPulse(signal);
      if (!mountedRef.current || signal?.aborted) return false;

      failedRef.current = false;
      setSnapshot(next);
      setHistory((previous) => mergeHistorySeries(previous, next.history));
      setLastUpdated(Date.now());
      setConnection(next.ok ? "live" : "degraded");
      setError(next.ok ? null : (next.errors[0] ?? "Every monitored RPC is unreachable."));
      return true;
    } catch (caught) {
      if (caught instanceof PulseRequestError && caught.kind === "aborted") return false;
      if (!mountedRef.current || signal?.aborted) return false;

      failedRef.current = true;
      setConnection("offline");
      setError(caught instanceof Error ? caught.message : "Unknown network error");
      return false;
    } finally {
      fetchingRef.current = false;
      if (mountedRef.current) setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      timer = setTimeout(() => void tick(), delay);
    };

    const tick = async () => {
      if (cancelled) return;

      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule(intervalMs);
        return;
      }

      await load(controller.signal);
      if (cancelled) return;
      schedule(failedRef.current ? RETRY_INTERVAL_MS : intervalMs);
    };

    // Fire immediately: a torn-down previous instance must never delay first paint.
    void tick();

    const onVisibilityChange = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (timer) clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      // Release the in-flight guard so the next instance is never blocked by an
      // aborted request that will never settle into this closure.
      fetchingRef.current = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controller.abort();
    };
  }, [attempt, intervalMs, load]);

  // Warm-up: true only until the first response (success or failure) lands.
  const isWarmingUp = snapshot === null && error === null;

  const pulseAgeMs = lastUpdated === null ? null : Math.max(0, clock - lastUpdated);
  const isStale = pulseAgeMs === null || pulseAgeMs > STALE_AFTER_MS;

  /**
   * Keep a live clock only while the UI actually renders something time-based.
   * During healthy operation nothing shows an age, so ticking every second
   * would be a re-render per second for no visible change.
   */
  const needsClock = isStale || connection !== "live";
  useEffect(() => {
    if (!needsClock) return;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [needsClock]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    snapshot,
    history,
    connection,
    error,
    lastUpdated,
    isLoading: isWarmingUp,
    isFetching,
    isStale,
    pulseAgeMs,
    elapsedMs: isWarmingUp ? Math.max(0, clock - startedAtRef.current) : 0,
    refresh,
  };
}
