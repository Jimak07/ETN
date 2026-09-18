"use client";

import { useEffect, useState } from "react";

import { formatRelativeTime } from "@/lib/format";

/** Re-renders once a second so "updated Xs ago" stays honest. */
export function useRelativeTime(timestamp: number | null, tickMs = 1000): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!timestamp) return;
    const interval = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(interval);
  }, [timestamp, tickMs]);

  return formatRelativeTime(timestamp, now);
}
