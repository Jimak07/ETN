"use client";

import { useEffect, useRef, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Eases a number towards its next value with requestAnimationFrame so KPI cards
 * tick up smoothly instead of snapping on every poll.
 */
export function useAnimatedNumber(value: number | null, durationMs = 650): number | null {
  const [displayed, setDisplayed] = useState<number | null>(value);
  const frameRef = useRef<number | null>(null);
  const fromRef = useRef<number | null>(value);

  useEffect(() => {
    if (value === null) {
      setDisplayed(null);
      fromRef.current = null;
      return;
    }

    if (prefersReducedMotion()) {
      fromRef.current = value;
      setDisplayed(value);
      return;
    }

    const from = fromRef.current;
    if (from === null) {
      fromRef.current = value;
      setDisplayed(value);
      return;
    }

    if (from === value) return;

    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (value - from) * eased;
      setDisplayed(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
        setDisplayed(value);
      }
    };

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  return displayed;
}
