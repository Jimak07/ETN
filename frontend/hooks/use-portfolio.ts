"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAddress, isAddress, type Address } from "viem";

import { DEFAULT_EXPLORER_ADDRESS, STORAGE_KEYS } from "@/lib/constants/myverse";
import { ETN_MAINNET } from "@/lib/etn";
import { getReadClient } from "@/lib/multi-sender/contract";
import { fetchPortfolioSummary } from "@/lib/portfolio/fetcher";
import type { PortfolioSummary, Timeframe, WatchlistItem } from "@/lib/portfolio/types";
import {
  addToWatchlist as saveToWatchlist,
  getSavedWatchlist,
  removeFromWatchlist as deleteFromWatchlist,
} from "@/lib/portfolio/watchlist";
import { getEthereumProvider, type Eip1193Provider } from "@/lib/wallet";

export function usePortfolio(initialAddress?: string) {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // Active address being inspected
  const [targetAddress, setTargetAddress] = useState<string>(() => {
    if (initialAddress && isAddress(initialAddress)) {
      return getAddress(initialAddress);
    }
    return DEFAULT_EXPLORER_ADDRESS;
  });

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Timeframe selector: 24H | 7D | 30D
  const [timeframe, setTimeframe] = useState<Timeframe>("24H");
  // Hide dust toggle
  const [hideDust, setHideDust] = useState<boolean>(true);

  // Watchlist state
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // Track initial mount to auto-switch to connected wallet if user connects
  const initialWalletSyncedRef = useRef(false);

  // 1. Initialise wallet provider & account synchronization
  useEffect(() => {
    const injected = getEthereumProvider();
    setProvider(injected);
    if (!injected) return;

    let cancelled = false;
    const sync = async () => {
      try {
        const [accounts, currentChain] = await Promise.all([
          injected.request({ method: "eth_accounts" }),
          injected.request({ method: "eth_chainId" }),
        ]);
        if (cancelled) return;
        const first = Array.isArray(accounts) && accounts[0] ? (accounts[0] as string) : null;
        if (first && isAddress(first)) {
          const checksum = getAddress(first);
          setAccount(checksum);
          // If no custom initialAddress was explicitly passed and this is initial load, switch to connected wallet
          if (!initialAddress && !initialWalletSyncedRef.current) {
            initialWalletSyncedRef.current = true;
            setTargetAddress(checksum);
          }
        }
        if (typeof currentChain === "string") {
          setChainId(Number.parseInt(currentChain, 16));
        }
      } catch {
        // Silently ignore
      }
    };

    void sync();

    const onAccountsChanged = (...args: unknown[]) => {
      const next = Array.isArray(args[0]) ? args[0] : [];
      const first = next[0] && typeof next[0] === "string" && isAddress(next[0]) ? getAddress(next[0]) : null;
      setAccount(first);
      if (first && !initialAddress) {
        setTargetAddress(first);
      }
    };

    const onChainChanged = (...args: unknown[]) => {
      if (typeof args[0] === "string") {
        setChainId(Number.parseInt(args[0], 16));
      }
    };

    const emitter = injected as unknown as {
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };

    emitter.on?.("accountsChanged", onAccountsChanged);
    emitter.on?.("chainChanged", onChainChanged);

    return () => {
      cancelled = true;
      emitter.removeListener?.("accountsChanged", onAccountsChanged);
      emitter.removeListener?.("chainChanged", onChainChanged);
    };
  }, [initialAddress]);

  // 2. Load preferences & watchlist from localStorage
  useEffect(() => {
    setWatchlist(getSavedWatchlist());

    try {
      const savedTf = window.localStorage.getItem(STORAGE_KEYS.ACTIVE_TIMEFRAME) as Timeframe;
      if (savedTf === "24H" || savedTf === "7D" || savedTf === "30D") {
        setTimeframe(savedTf);
      }
      const savedDust = window.localStorage.getItem(STORAGE_KEYS.HIDE_DUST);
      if (savedDust !== null) {
        setHideDust(savedDust === "true");
      }
    } catch {
      // Ignore
    }
  }, []);

  // Update localStorage when preferences change
  const handleTimeframeChange = useCallback((tf: Timeframe) => {
    setTimeframe(tf);
    try {
      window.localStorage.setItem(STORAGE_KEYS.ACTIVE_TIMEFRAME, tf);
    } catch {
      // Ignore
    }
  }, []);

  const handleToggleHideDust = useCallback(() => {
    setHideDust((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEYS.HIDE_DUST, String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  // 3. Fetch Portfolio Data
  const loadPortfolio = useCallback(
    async (address: string, isRefresh = false) => {
      if (!isAddress(address)) {
        setError(`"${address}" is not a valid 0x address.`);
        setLoading(false);
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const client = getReadClient(ETN_MAINNET.id);
      if (!client) {
        setError("Failed to initialize Electroneum RPC client.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      try {
        const data = await fetchPortfolioSummary(address, client);
        setSummary(data);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load address telemetry";
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    if (targetAddress && isAddress(targetAddress)) {
      void loadPortfolio(targetAddress);
    }
  }, [targetAddress, loadPortfolio]);

  // 4. Watchlist actions
  const isWatchlisted = useMemo(() => {
    if (!targetAddress || !isAddress(targetAddress)) return false;
    const lower = targetAddress.toLowerCase();
    return watchlist.some((item) => item.address.toLowerCase() === lower);
  }, [targetAddress, watchlist]);

  const toggleWatchlist = useCallback(
    (label?: string) => {
      if (!targetAddress || !isAddress(targetAddress)) return;
      if (isWatchlisted) {
        const updated = deleteFromWatchlist(targetAddress);
        setWatchlist(updated);
      } else {
        const updated = saveToWatchlist(targetAddress, label || "Saved Wallet");
        setWatchlist(updated);
      }
    },
    [targetAddress, isWatchlisted]
  );

  const selectAddress = useCallback((newAddress: string) => {
    if (isAddress(newAddress)) {
      const checksum = getAddress(newAddress);
      setTargetAddress(checksum);
    }
  }, []);

  const refresh = useCallback(() => {
    return loadPortfolio(targetAddress, true);
  }, [targetAddress, loadPortfolio]);

  const isWhaleMode = useMemo(() => {
    if (!account) return true;
    return targetAddress.toLowerCase() !== account.toLowerCase();
  }, [account, targetAddress]);

  return {
    targetAddress,
    summary,
    loading,
    refreshing,
    error,
    timeframe,
    setTimeframe: handleTimeframeChange,
    hideDust,
    toggleHideDust: handleToggleHideDust,
    watchlist,
    isWatchlisted,
    toggleWatchlist,
    selectAddress,
    refresh,
    account,
    chainId,
    isWhaleMode,
  };
}
