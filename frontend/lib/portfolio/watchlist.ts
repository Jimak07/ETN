import { getAddress, isAddress, type Address } from "viem";

import { SHOWCASE_WALLETS, STORAGE_KEYS } from "@/lib/constants/myverse";
import type { WatchlistItem } from "./types";

const SHOWCASE_ADDRESS_SET = new Set(
  SHOWCASE_WALLETS.map((w) => w.address.toLowerCase())
);

/**
 * Returns an empty list as default for the user's personal saved watchlist.
 * Showcase whales are never added by default to prevent data leakage into My Portfolio.
 */
export function getDefaultWatchlist(): WatchlistItem[] {
  return [];
}

/**
 * Read saved watchlist from browser localStorage.
 * Filters out any preset showcase whales to guarantee that only user-added wallets are saved.
 */
export function getSavedWatchlist(): WatchlistItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.WATCHLIST);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }

    return parsed
      .filter((item): item is WatchlistItem => {
        return (
          typeof item === "object" &&
          item !== null &&
          typeof item.address === "string" &&
          isAddress(item.address) &&
          typeof item.label === "string" &&
          // STRICT RULE: Never treat preset showcase whales as user's personal watchlisted wallets
          !SHOWCASE_ADDRESS_SET.has(item.address.toLowerCase())
        );
      })
      .map((item) => ({
        ...item,
        address: getAddress(item.address),
      }));
  } catch {
    return [];
  }
}

/**
 * Persist watchlist to localStorage.
 */
export function saveWatchlist(items: WatchlistItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(items));
  } catch {
    // Ignore storage quota or disabled errors
  }
}

/**
 * Add an address to the watchlist.
 */
export function addToWatchlist(address: string, label: string): WatchlistItem[] {
  if (!isAddress(address)) return getSavedWatchlist();
  const checksum = getAddress(address);
  const current = getSavedWatchlist();

  // If already exists, update label
  const existsIndex = current.findIndex(
    (item) => item.address.toLowerCase() === checksum.toLowerCase()
  );
  if (existsIndex >= 0) {
    const updated = [...current];
    updated[existsIndex] = {
      ...updated[existsIndex],
      label: label.trim() || updated[existsIndex].label,
    };
    saveWatchlist(updated);
    return updated;
  }

  const newItem: WatchlistItem = {
    address: checksum,
    label: label.trim() || `${checksum.slice(0, 6)}...${checksum.slice(-4)}`,
    addedAt: Date.now(),
  };

  const next = [newItem, ...current];
  saveWatchlist(next);
  return next;
}

/**
 * Remove an address from the watchlist.
 */
export function removeFromWatchlist(address: string): WatchlistItem[] {
  const current = getSavedWatchlist();
  const next = current.filter((item) => item.address.toLowerCase() !== address.toLowerCase());
  saveWatchlist(next);
  return next;
}
