"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { erc20Abi, getAddress, isAddress, type Address } from "viem";

import { DEFAULT_EXPLORER_ADDRESS, STORAGE_KEYS } from "@/lib/constants/myverse";
import { ETN_MAINNET } from "@/lib/etn";
import { getReadClient, getWalletClient } from "@/lib/multi-sender/contract";
import { fetchBundleSummary, fetchPortfolioSummary } from "@/lib/portfolio/fetcher";
import type { PortfolioSummary, Timeframe, TokenApprovalItem, WatchlistItem } from "@/lib/portfolio/types";
import {
  addToWatchlist as saveToWatchlist,
  getSavedWatchlist,
  removeFromWatchlist as deleteFromWatchlist,
} from "@/lib/portfolio/watchlist";
import { getEthereumProvider, type Eip1193Provider } from "@/lib/wallet";

export interface UsePortfolioOptions {
  initialAddress?: string;
  mode?: "portfolio" | "explorer";
}

export function usePortfolio(initialAddressOrOptions?: string | UsePortfolioOptions) {
  const options: UsePortfolioOptions =
    typeof initialAddressOrOptions === "string"
      ? { initialAddress: initialAddressOrOptions }
      : initialAddressOrOptions ?? {};

  const { initialAddress, mode = "portfolio" } = options;

  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  // Active address being inspected:
  // In personal ("portfolio") mode, STRICTLY initialize as empty string unless a valid initialAddress was provided.
  // NEVER fall back to DEFAULT_EXPLORER_ADDRESS in personal mode!
  const [targetAddress, setTargetAddress] = useState<string>(() => {
    if (initialAddress && isAddress(initialAddress)) {
      return getAddress(initialAddress);
    }
    if (mode === "explorer") {
      return DEFAULT_EXPLORER_ADDRESS;
    }
    return "";
  });

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(() => {
    if (initialAddress && isAddress(initialAddress)) return true;
    if (mode === "explorer") return true;
    return false;
  });
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Timeframe selector: 24H | 7D | 30D
  const [timeframe, setTimeframe] = useState<Timeframe>("24H");
  // Hide dust toggle
  const [hideDust, setHideDust] = useState<boolean>(true);

  // Watchlist state (custom user-added only)
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // Bundle Mode state (PRO: combine up to 10 wallets)
  const [isBundleMode, setIsBundleMode] = useState<boolean>(false);
  const [selectedBundleAddresses, setSelectedBundleAddresses] = useState<Address[]>([]);

  // Revoke state
  const [revokingSpender, setRevokingSpender] = useState<string | null>(null);
  const [batchRevoking, setBatchRevoking] = useState<boolean>(false);
  const [revokeProgress, setRevokeProgress] = useState<{ current: number; total: number } | null>(null);

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
          if (mode === "portfolio" || !initialAddress) {
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
      if (first) {
        if (mode === "portfolio" || !initialAddress) {
          setTargetAddress(first);
        }
      } else {
        if (mode === "portfolio") {
          setTargetAddress("");
          setSummary(null);
        }
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
  }, [initialAddress, mode]);

  // Sync mode changes to isolate Personal vs Explorer
  useEffect(() => {
    if (mode === "portfolio") {
      if (account) {
        setTargetAddress(account);
      } else {
        setTargetAddress("");
        setSummary(null);
        setLoading(false);
      }
    } else if (mode === "explorer") {
      if (!targetAddress || !isAddress(targetAddress)) {
        setTargetAddress(
          initialAddress && isAddress(initialAddress)
            ? getAddress(initialAddress)
            : DEFAULT_EXPLORER_ADDRESS
        );
      }
    }
  }, [mode, account, initialAddress]);

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

  // 3. Fetch Portfolio Data (Single or Bundle Mode)
  const loadPortfolio = useCallback(
    async (address: string, isRefresh = false, bundleAddrs?: Address[]) => {
      // If bundle mode is active with valid addresses
      if (bundleAddrs && bundleAddrs.length > 0) {
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
          const data = await fetchBundleSummary(bundleAddrs, client);
          setSummary(data);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to load bundle telemetry";
          setError(msg);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }

      // If address is empty or invalid, do not attempt to fetch
      if (!address || !isAddress(address)) {
        setLoading(false);
        setRefreshing(false);
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
    if (isBundleMode) {
      if (selectedBundleAddresses.length > 0) {
        void loadPortfolio(targetAddress, false, selectedBundleAddresses);
      }
    } else if (targetAddress && isAddress(targetAddress)) {
      void loadPortfolio(targetAddress, false);
    } else {
      setLoading(false);
    }
  }, [targetAddress, isBundleMode, selectedBundleAddresses, loadPortfolio]);

  // 4. Watchlist & Bundle actions
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
        setSelectedBundleAddresses((prev) =>
          prev.filter((a) => a.toLowerCase() !== targetAddress.toLowerCase())
        );
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
      setIsBundleMode(false);
      setTargetAddress(checksum);
    } else if (newAddress === "") {
      setIsBundleMode(false);
      setTargetAddress("");
      setSummary(null);
    }
  }, []);

  const clearPortfolio = useCallback(() => {
    setSummary(null);
    setError(null);
    setIsBundleMode(false);
    setSelectedBundleAddresses([]);
  }, []);

  const toggleBundleMode = useCallback(() => {
    setIsBundleMode((prev) => {
      const next = !prev;
      if (next && selectedBundleAddresses.length === 0) {
        // In personal mode, only bundle custom watchlist items (or the connected account itself)
        const customOnly = watchlist.slice(0, 10).map((w) => getAddress(w.address));
        if (customOnly.length === 0 && account) {
          setSelectedBundleAddresses([account]);
        } else if (customOnly.length > 0) {
          setSelectedBundleAddresses(customOnly);
        } else if (isAddress(targetAddress)) {
          setSelectedBundleAddresses([getAddress(targetAddress)]);
        }
      }
      return next;
    });
  }, [selectedBundleAddresses.length, watchlist, account, targetAddress]);

  const toggleSelectBundleAddress = useCallback((addr: string) => {
    if (!isAddress(addr)) return;
    const checksum = getAddress(addr);
    setSelectedBundleAddresses((prev) => {
      const exists = prev.some((a) => a.toLowerCase() === checksum.toLowerCase());
      if (exists) {
        return prev.filter((a) => a.toLowerCase() !== checksum.toLowerCase());
      } else {
        if (prev.length >= 10) return prev; // max 10 wallets
        return [...prev, checksum];
      }
    });
  }, []);

  const selectAllBundleAddresses = useCallback(() => {
    const all = watchlist.slice(0, 10).map((w) => getAddress(w.address));
    if (all.length === 0 && isAddress(targetAddress)) {
      setSelectedBundleAddresses([getAddress(targetAddress)]);
    } else {
      setSelectedBundleAddresses(all);
    }
  }, [watchlist, targetAddress]);

  const clearBundleAddresses = useCallback(() => {
    setSelectedBundleAddresses([]);
  }, []);

  const refresh = useCallback(() => {
    if (isBundleMode && selectedBundleAddresses.length > 0) {
      return loadPortfolio(targetAddress, true, selectedBundleAddresses);
    }
    if (targetAddress && isAddress(targetAddress)) {
      return loadPortfolio(targetAddress, true);
    }
  }, [targetAddress, isBundleMode, selectedBundleAddresses, loadPortfolio]);

  // 5. Revoke Shield Actions
  const revokeAllowance = useCallback(
    async (tokenAddress: Address, spenderAddress: Address): Promise<boolean> => {
      if (!provider || !account) {
        throw new Error("Wallet not connected");
      }
      const key = `${tokenAddress.toLowerCase()}-${spenderAddress.toLowerCase()}`;
      setRevokingSpender(key);
      try {
        const activeChainId = chainId ?? ETN_MAINNET.id;
        const walletClient = getWalletClient(provider, account, activeChainId);
        const hash = await walletClient.writeContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "approve",
          args: [spenderAddress, 0n],
        });
        const client = getReadClient(activeChainId);
        if (client) {
          await client.waitForTransactionReceipt({ hash });
        }
        if (summary) {
          setSummary((prev) => {
            if (!prev) return prev;
            const updatedApprovals = prev.intelligence.approvals.filter(
              (a) =>
                !(
                  a.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() &&
                  a.spenderAddress.toLowerCase() === spenderAddress.toLowerCase()
                )
            );
            return {
              ...prev,
              intelligence: {
                ...prev.intelligence,
                approvals: updatedApprovals,
              },
            };
          });
        }
        return true;
      } finally {
        setRevokingSpender(null);
      }
    },
    [provider, account, chainId, summary]
  );

  const batchRevokeAllowances = useCallback(
    async (approvals: TokenApprovalItem[]): Promise<{ successful: number; failed: number }> => {
      if (!provider || !account) {
        throw new Error("Wallet not connected");
      }
      setBatchRevoking(true);
      setRevokeProgress({ current: 0, total: approvals.length });
      let successful = 0;
      let failed = 0;
      const revokedKeys = new Set<string>();

      const activeChainId = chainId ?? ETN_MAINNET.id;
      const walletClient = getWalletClient(provider, account, activeChainId);
      const client = getReadClient(activeChainId);

      try {
        for (let i = 0; i < approvals.length; i++) {
          const item = approvals[i];
          setRevokeProgress({ current: i + 1, total: approvals.length });
          try {
            const hash = await walletClient.writeContract({
              address: item.tokenAddress,
              abi: erc20Abi,
              functionName: "approve",
              args: [item.spenderAddress, 0n],
            });
            if (client) {
              await client.waitForTransactionReceipt({ hash });
            }
            successful++;
            revokedKeys.add(`${item.tokenAddress.toLowerCase()}-${item.spenderAddress.toLowerCase()}`);
          } catch (err) {
            console.error(`Failed to revoke ${item.tokenSymbol} for ${item.spenderName}:`, err);
            failed++;
          }
        }

        if (summary && revokedKeys.size > 0) {
          setSummary((prev) => {
            if (!prev) return prev;
            const updatedApprovals = prev.intelligence.approvals.filter(
              (a) =>
                !revokedKeys.has(`${a.tokenAddress.toLowerCase()}-${a.spenderAddress.toLowerCase()}`)
            );
            return {
              ...prev,
              intelligence: {
                ...prev.intelligence,
                approvals: updatedApprovals,
              },
            };
          });
        }

        return { successful, failed };
      } finally {
        setBatchRevoking(false);
        setRevokeProgress(null);
      }
    },
    [provider, account, chainId, summary]
  );

  const isWhaleMode = useMemo(() => {
    if (isBundleMode) return false;
    if (!account) return true;
    if (!targetAddress) return false;
    return targetAddress.toLowerCase() !== account.toLowerCase();
  }, [isBundleMode, account, targetAddress]);

  const connectWallet = useCallback(async () => {
    const injected = provider ?? getEthereumProvider();
    if (!injected) {
      window.open("https://metamask.io/download/", "_blank");
      return;
    }
    try {
      const res = await injected.request({ method: "eth_requestAccounts" });
      const first = Array.isArray(res) && res[0] ? (res[0] as string) : null;
      if (first && isAddress(first)) {
        const checksum = getAddress(first);
        setAccount(checksum);
        setTargetAddress(checksum);
      }
    } catch (err) {
      console.error("Wallet connection declined or failed:", err);
    }
  }, [provider]);

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
    clearPortfolio,
    refresh,
    account,
    chainId,
    connectWallet,
    isWhaleMode,
    isBundleMode,
    selectedBundleAddresses,
    toggleBundleMode,
    toggleSelectBundleAddress,
    selectAllBundleAddresses,
    clearBundleAddresses,
    revokingSpender,
    batchRevoking,
    revokeProgress,
    revokeAllowance,
    batchRevokeAllowances,
  };
}
