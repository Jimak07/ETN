"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatEther, getAddress, isAddress, type Address } from "viem";

import { ETN_MAINNET } from "@/lib/etn";
import { switchChain } from "@/lib/wallet";
import { walletDiscovery } from "./providers";
import type {
  EIP6963ProviderDetail,
  Eip1193Provider,
  WalletContextState,
} from "./types";

const PREFERRED_WALLET_STORAGE_KEY = "verse_preferred_wallet_rdns";

const WalletContext = createContext<WalletContextState | null>(null);

function parseChainId(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.startsWith("0x") ? value.slice(2) : value, 16);
    return Number.isInteger(parsed) ? parsed : null;
  }
  if (typeof value === "number" && Number.isInteger(value)) return value;
  return null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [detectedWallets, setDetectedWallets] = useState<EIP6963ProviderDetail[]>([]);
  const [activeWallet, setActiveWallet] = useState<EIP6963ProviderDetail | null>(null);
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceRaw, setBalanceRaw] = useState<bigint | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // References to keep event handlers fresh without re-subscribing endlessly
  const activeWalletRef = useRef<EIP6963ProviderDetail | null>(null);
  activeWalletRef.current = activeWallet;

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  // Universal Daily Check-in & Activity Backfill trigger
  const triggerCheckin = useCallback(async (addr: Address) => {
    const normalized = addr.toLowerCase();
    const sessionKey = `verse_checkin_${normalized}`;
    const last = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(sessionKey) : null;
    const now = Date.now();
    if (last && now - Number(last) < 60_000) return;
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(sessionKey, String(now));
    }

    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DAILY_CHECKIN",
          walletAddress: normalized,
        }),
      });
    } catch (err) {
      console.warn("[WalletContext] Universal daily check-in trigger:", err);
    }
  }, []);

  // Fetch native ETN balance
  const refreshBalance = useCallback(async () => {
    if (!account) {
      setBalance(null);
      setBalanceRaw(null);
      return;
    }

    try {
      const activeP = activeWalletRef.current?.provider ?? provider;
      let rawBal: bigint | null = null;

      if (activeP) {
        try {
          const res = await activeP.request({
            method: "eth_getBalance",
            params: [account, "latest"],
          });
          if (typeof res === "string") {
            rawBal = BigInt(res);
          }
        } catch {
          // Fall back to direct JSON-RPC if provider request fails
        }
      }

      if (rawBal === null) {
        const resp = await fetch(ETN_MAINNET.rpcUrls[0], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [account, "latest"],
          }),
        });
        const data = await resp.json();
        if (data.result && typeof data.result === "string") {
          rawBal = BigInt(data.result);
        }
      }

      if (rawBal !== null) {
        setBalanceRaw(rawBal);
        const floatBal = parseFloat(formatEther(rawBal));
        setBalance(
          `${floatBal.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          })} ETN`
        );
      }
    } catch (err) {
      console.warn("[WalletContext] Error refreshing balance:", err);
    }
  }, [account, provider]);

  // Connect to a chosen wallet
  const connect = useCallback(
    async (wallet: EIP6963ProviderDetail): Promise<boolean> => {
      setConnecting(true);
      try {
        const p = wallet.provider;
        const accountsResult = await p.request({ method: "eth_requestAccounts" });
        if (!Array.isArray(accountsResult) || accountsResult.length === 0) {
          throw new Error("No accounts returned from wallet.");
        }

        const rawAddr = accountsResult[0];
        if (typeof rawAddr !== "string" || !isAddress(rawAddr)) {
          throw new Error("Invalid address returned from wallet.");
        }

        const checksummed = getAddress(rawAddr);

        // Check & prompt network switch to Electroneum Mainnet if needed
        let rawChain = await p.request({ method: "eth_chainId" });
        let activeChainId = parseChainId(rawChain);

        if (activeChainId !== ETN_MAINNET.id) {
          const switchRes = await switchChain(p, ETN_MAINNET.id);
          if (switchRes.ok) {
            activeChainId = ETN_MAINNET.id;
          }
        }

        setActiveWallet(wallet);
        setProvider(p);
        setAccount(checksummed);
        setChainId(activeChainId);

        if (typeof localStorage !== "undefined") {
          localStorage.setItem(PREFERRED_WALLET_STORAGE_KEY, wallet.info.rdns);
        }

        setIsModalOpen(false);
        void triggerCheckin(checksummed);
        return true;
      } catch (err) {
        console.error("[WalletContext] Failed to connect wallet:", err);
        return false;
      } finally {
        setConnecting(false);
      }
    },
    [triggerCheckin]
  );

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setActiveWallet(null);
    setProvider(null);
    setAccount(null);
    setChainId(null);
    setBalance(null);
    setBalanceRaw(null);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(PREFERRED_WALLET_STORAGE_KEY);
    }
  }, []);

  // Switch network to Electroneum Mainnet
  const switchToElectroneum = useCallback(async (): Promise<boolean> => {
    const p = activeWalletRef.current?.provider ?? provider;
    if (!p) return false;

    setSwitching(true);
    try {
      const res = await switchChain(p, ETN_MAINNET.id);
      if (res.ok) {
        setChainId(ETN_MAINNET.id);
        void refreshBalance();
        return true;
      }
      return false;
    } catch (err) {
      console.warn("[WalletContext] Network switch failed:", err);
      return false;
    } finally {
      setSwitching(false);
    }
  }, [provider, refreshBalance]);

  // Request account switch / permissions
  const switchAccount = useCallback(async () => {
    const p = activeWalletRef.current?.provider ?? provider;
    if (!p) {
      setIsModalOpen(true);
      return;
    }

    try {
      // EIP-2255 wallet_requestPermissions allows prompting account picker
      await p.request({
        method: "wallet_requestPermissions",
        params: [{ eth_accounts: {} }],
      });
      const accounts = await p.request({ method: "eth_accounts" });
      if (Array.isArray(accounts) && accounts[0] && isAddress(accounts[0])) {
        const next = getAddress(accounts[0]);
        setAccount(next);
        void triggerCheckin(next);
        void refreshBalance();
      }
    } catch {
      // If unsupported or declined, open the selector modal so user can switch wallet
      setIsModalOpen(true);
    }
  }, [provider, refreshBalance, triggerCheckin]);

  // 1. Initialize EIP-6963 discovery and sync detected wallets
  useEffect(() => {
    walletDiscovery.init();
    setDetectedWallets(walletDiscovery.getDetectedWallets());

    const unsubscribe = walletDiscovery.subscribe(() => {
      setDetectedWallets(walletDiscovery.getDetectedWallets());
    });

    return () => unsubscribe();
  }, []);

  // 2. Silent auto-reconnect on mount if preferred wallet RDNS was saved
  useEffect(() => {
    if (typeof window === "undefined" || activeWalletRef.current) return;

    const savedRdns = localStorage.getItem(PREFERRED_WALLET_STORAGE_KEY);
    if (!savedRdns) return;

    const tryAutoConnect = async () => {
      const detected = walletDiscovery.getDetectedWallets();
      const match = detected.find(
        (w) => w.info.rdns.toLowerCase() === savedRdns.toLowerCase()
      );

      if (!match) return;

      try {
        // Query silently without popping extension window
        const accounts = await match.provider.request({ method: "eth_accounts" });
        if (Array.isArray(accounts) && accounts.length > 0 && isAddress(accounts[0])) {
          const checksummed = getAddress(accounts[0]);
          const rawChain = await match.provider.request({ method: "eth_chainId" });
          const parsedChain = parseChainId(rawChain);

          setActiveWallet(match);
          setProvider(match.provider);
          setAccount(checksummed);
          setChainId(parsedChain);
          void triggerCheckin(checksummed);
        }
      } catch {
        // Auto-reconnect failed silently
      }
    };

    void tryAutoConnect();

    // Re-attempt after short delays in case extension announced asynchronously
    const t1 = setTimeout(tryAutoConnect, 600);
    const t2 = setTimeout(tryAutoConnect, 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [triggerCheckin]);

  // 3. Provider event listeners (accountsChanged, chainChanged)
  useEffect(() => {
    const p = activeWallet?.provider;
    if (!p) return;

    const handleAccountsChanged = (accounts: unknown) => {
      if (Array.isArray(accounts) && accounts.length > 0 && typeof accounts[0] === "string") {
        const next = getAddress(accounts[0]);
        setAccount(next);
        void triggerCheckin(next);
        void refreshBalance();
      } else {
        // User disconnected or locked in extension
        disconnect();
      }
    };

    const handleChainChanged = (newChainId: unknown) => {
      const parsed = parseChainId(newChainId);
      setChainId(parsed);
      void refreshBalance();
    };

    if (typeof p.on === "function") {
      p.on("accountsChanged", handleAccountsChanged);
      p.on("chainChanged", handleChainChanged);
    }

    return () => {
      if (typeof p.removeListener === "function") {
        p.removeListener("accountsChanged", handleAccountsChanged);
        p.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [activeWallet, disconnect, refreshBalance, triggerCheckin]);

  // 4. Update balance whenever account or chainId changes
  useEffect(() => {
    if (account) {
      void refreshBalance();
    }
  }, [account, chainId, refreshBalance]);

  const isChainOk = chainId === ETN_MAINNET.id;

  const value: WalletContextState = {
    account,
    chainId,
    isChainOk,
    provider,
    activeWallet,
    detectedWallets,
    connecting,
    switching,
    balance,
    balanceRaw,
    isModalOpen,
    openModal,
    closeModal,
    connect,
    disconnect,
    switchToElectroneum,
    switchAccount,
    refreshBalance,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletContext(): WalletContextState {
  const ctx = useContext(WalletContext);
  if (!ctx) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return ctx;
}
