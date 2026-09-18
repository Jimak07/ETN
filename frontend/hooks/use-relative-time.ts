"use client";

import { useEffect, useState } from "react";

import { formatRelativeTime } from "@/lib/format";

export interface UseRelativeTimeOptions {
  /**
   * When false the hook goes inert: no interval, no re-renders. The dashboard
   * hides the elapsed time during healthy operation, so ticking every second
   * just to keep an invisible label honest would be a render per second for
   * no visible change. The returned value is only meaningful while enabled.
   */
  enabled?: boolean;
  tickMs?: number;
}

/** Formats a timestamp as "18s ago", re-rendering once a second while enabled. */
export function useRelativeTime(
  timestamp: number | null,
  { enabled = true, tickMs = 1000 }: UseRelativeTimeOptions = {},
): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timestamp || !enabled) return;

    // Resync on (re)enable so the first frame is never computed against a clock
    // that stopped while the label was hidden.
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(interval);
  }, [timestamp, enabled, tickMs]);

  return formatRelativeTime(timestamp, now);
}
