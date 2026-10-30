import { getAddress, isAddress, type Address } from "viem";

import { SHOWCASE_WALLETS, STORAGE_KEYS } from "@/lib/constants/myverse";
import type { WatchlistItem } from "./types";

const SHOWCASE_ADDRESS_SET = new Set(
  SHOWCASE_WALLETS.map((w) => w.address.toLowerCase())
);

export const MAX_WATCHLIST_ITEMS = 50;
export const MAX_LABEL_LENGTH = 32;

/**
 * Returns an empty list as default for the user's personal saved watchlist.
 * Showcase whales are never added by default to prevent data leakage into My Portfolio.
 */
export function getDefaultWatchlist(): WatchlistItem[] {
  return [];
}

/**
 * Read saved watchlist from browser localStorage.
 * Strictly validates against storage poisoning, malicious types, and arbitrary length payloads.
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

    // Enforce array ceiling to defend against memory exhaustion
    const bounded = parsed.slice(0, MAX_WATCHLIST_ITEMS);

    return bounded
      .filter((item): item is WatchlistItem => {
        return (
          typeof item === "object" &&
          item !== null &&
          typeof item.address === "string" &&
          isAddress(item.address, { strict: false }) &&
          typeof item.label === "string" &&
          // STRICT RULE: Never treat preset showcase whales as user's personal watchlisted wallets
          !SHOWCASE_ADDRESS_SET.has(item.address.toLowerCase())
        );
      })
      .map((item) => ({
        address: getAddress(item.address),
        label: String(item.label).trim().slice(0, MAX_LABEL_LENGTH) || `${item.address.slice(0, 6)}...${item.address.slice(-4)}`,
        addedAt: typeof item.addedAt === "number" && Number.isFinite(item.addedAt) ? item.addedAt : Date.now(),
      }));
  } catch {
    return [];
  }
}

/**
 * Persist watchlist to localStorage with schema bounds.
 */
export function saveWatchlist(items: WatchlistItem[]): void {
  if (typeof window === "undefined") return;
  try {
    const sanitized = items
      .slice(0, MAX_WATCHLIST_ITEMS)
      .filter((item) => isAddress(item.address, { strict: false }))
      .map((item) => ({
        address: getAddress(item.address),
        label: String(item.label).trim().slice(0, MAX_LABEL_LENGTH),
        addedAt: item.addedAt || Date.now(),
      }));

    window.localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(sanitized));
  } catch {
    // Ignore storage quota or disabled errors
  }
}

/**
 * Add an address to the watchlist.
 */
export function addToWatchlist(address: string, label: string): WatchlistItem[] {
  if (!isAddress(address, { strict: false })) return getSavedWatchlist();
  const checksum = getAddress(address);
  const current = getSavedWatchlist();

  const sanitizedLabel = label.trim().slice(0, MAX_LABEL_LENGTH);

  // If already exists, update label
  const existsIndex = current.findIndex(
    (item) => item.address.toLowerCase() === checksum.toLowerCase()
  );
  if (existsIndex >= 0) {
    const updated = [...current];
    updated[existsIndex] = {
      ...updated[existsIndex],
      label: sanitizedLabel || updated[existsIndex].label,
    };
    saveWatchlist(updated);
    return updated;
  }

  const newItem: WatchlistItem = {
    address: checksum,
    label: sanitizedLabel || `${checksum.slice(0, 6)}...${checksum.slice(-4)}`,
    addedAt: Date.now(),
  };

  const next = [newItem, ...current].slice(0, MAX_WATCHLIST_ITEMS);
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
