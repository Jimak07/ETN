"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ANALYTICS_POLL_INTERVAL_MS,
  ANALYTICS_RETRY_INTERVAL_MS,
  AnalyticsRequestError,
  DEFAULT_HISTORY_RANGE,
  fetchAnalytics,
  type AnalyticsResponse,
  type HistoryRange,
} from "@/lib/analytics";

export interface UseAnalyticsResult {
  data: AnalyticsResponse | null;
  /** True only until the first response (success *or* failure) lands. */
  isLoading: boolean;
  /** True while a request is actually in flight. */
  isFetching: boolean;
  /**
   * True while the payload on screen still belongs to a *previous* window,
   * i.e. the user just changed the timeframe and the new one is on its way.
   * The uptime and heatmap cards ignore this — only the chart swaps to a
   * skeleton, so the rest of the dashboard stays interactive.
   */
  isSwitchingRange: boolean;
  /** The window being polled, echoed back for labels and axis formatting. */
  range: HistoryRange;
  /** Message from the last failed read; cleared once a read succeeds. */
  error: string | null;
  lastUpdated: number | null;
  refresh: () => void;
}

/**
 * Polls `/api/analytics?range=`.
 *
 * Same contract as `usePulse` — bounded requests, no overlapping polls, the
 * last good payload retained on failure — but on a lazy cadence, because these
 * aggregates cover a 24h window and a day/hour profile rather than a live
 * block height. Reads are paused while the tab is hidden and repeated
 * immediately when it comes back.
 *
 * `range` selects the chart window (the server picks the matching bucket
 * width). Changing it re-polls immediately without clearing `data`, so the
 * uptime and heatmap panels never blank out mid-switch.
 */
export function useAnalytics(
  range: HistoryRange = DEFAULT_HISTORY_RANGE,
  intervalMs: number = ANALYTICS_POLL_INTERVAL_MS,
): UseAnalyticsResult {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  // The window the current payload (or the last failed attempt) was for. It is
  // what separates "still loading the range I asked for" from "showing the old
  // range while the new one loads".
  const [loadedRange, setLoadedRange] = useState<HistoryRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const mountedRef = useRef(true);
  const fetchingRef = useRef(false);
  const failedRef = useRef(false);

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

      if (!fetchingRef.current) {
        fetchingRef.current = true;
        setIsFetching(true);

        try {
          const next = await fetchAnalytics(range, controller.signal);
          if (mountedRef.current && !controller.signal.aborted) {
            failedRef.current = false;
            setData(next);
            setLoadedRange(range);
            setError(next.ok ? null : (next.errors[0] ?? "Analytics reported a problem."));
            setLastUpdated(Date.now());
          }
        } catch (caught) {
          if (!(caught instanceof AnalyticsRequestError && caught.kind === "aborted")) {
            if (mountedRef.current && !controller.signal.aborted) {
              failedRef.current = true;
              // The attempt settled, so the chart stops waiting for it. It keeps
              // the previous window rather than spinning forever; `error` says
              // why the requested one is missing.
              setLoadedRange(range);
              setError(caught instanceof Error ? caught.message : "Unknown analytics error");
            }
          }
        } finally {
          // A range switch tears the old effect down mid-flight; those late
          // writes must not release the guard the *new* effect now owns.
          if (!cancelled) {
            fetchingRef.current = false;
            if (mountedRef.current) setIsFetching(false);
          }
        }
      }

      if (cancelled) return;
      schedule(failedRef.current ? ANALYTICS_RETRY_INTERVAL_MS : intervalMs);
    };

    // Fire immediately: analytics must not wait a full minute for first paint.
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
      // Release the in-flight guard so the next instance is never blocked by a
      // request that was aborted on teardown.
      fetchingRef.current = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controller.abort();
    };
  }, [attempt, intervalMs, range]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    data,
    // Warm-up ends on the first response of any kind, so the cards always
    // settle into either data or an error instead of an endless skeleton.
    isLoading: data === null && error === null,
    isFetching,
    // Only a *pending* switch counts: once a read has failed, `error` explains
    // the gap and the chart falls back to its own empty state instead of
    // shimmering forever.
    isSwitchingRange: loadedRange !== range && error === null,
    range,
    error,
    lastUpdated,
    refresh,
  };
}
