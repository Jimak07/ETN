"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  erc20Abi,
  formatUnits,
  getAddress,
  isAddress,
  maxUint256,
  parseUnits,
  type Address,
  type Hash,
} from "viem";

import {
  DEFAULT_DEADLINE_MINUTES,
  DEFAULT_ECOSYSTEM_TOKENS,
  DEFAULT_SLIPPAGE,
  ELECTROSWAP_V2_ROUTER_ADDRESS,
  NATIVE_ETN_TOKEN,
  WETN_ADDRESS,
  type TokenInfo,
} from "@/lib/constants/electroswap";
import {
  getReadClient,
  getWalletClient,
  waitForReceipt,
} from "@/lib/multi-sender/contract";
import {
  executeSwap,
  getSwapQuote,
  type SwapQuote,
} from "@/lib/swap/router";
import {
  fetchBlockscoutTokens,
  getStoredCustomTokens,
  saveCustomToken as persistCustomToken,
  removeCustomToken as deleteCustomToken,
} from "@/lib/swap/tokens";
import { ETN_MAINNET } from "@/lib/etn";
import { getEthereumProvider, switchChain, type Eip1193Provider } from "@/lib/wallet";

export type SwapPhase = "idle" | "signing" | "broadcasting" | "confirmed" | "error";

export function useSwap() {
  // --- Wallet & Network State ---
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  // --- Tokens State ---
  const [tokens, setTokens] = useState<TokenInfo[]>([...DEFAULT_ECOSYSTEM_TOKENS]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [payToken, setPayToken] = useState<TokenInfo>(NATIVE_ETN_TOKEN);
  const [receiveToken, setReceiveToken] = useState<TokenInfo>(
    DEFAULT_ECOSYSTEM_TOKENS[2] ?? DEFAULT_ECOSYSTEM_TOKENS[1]
  );

  // --- Balances State ---
  const [payBalance, setPayBalance] = useState<bigint | null>(null);
  const [receiveBalance, setReceiveBalance] = useState<bigint | null>(null);

  // --- Amounts & Quoting State ---
  const [payAmount, setPayAmount] = useState<string>("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);

  // --- Settings State ---
  const [slippage, setSlippage] = useState<number>(DEFAULT_SLIPPAGE);
  const [deadlineMinutes, setDeadlineMinutes] = useState<number>(DEFAULT_DEADLINE_MINUTES);

  // --- Allowance State ---
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [approving, setApproving] = useState(false);

  // --- Transaction Execution State ---
  const [swapPhase, setSwapPhase] = useState<SwapPhase>("idle");
  const [txHash, setTxHash] = useState<Hash | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const chainOk = chainId === ETN_MAINNET.id;

  // 1. Initialise wallet provider & account sync
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
        setAccount(first && isAddress(first) ? getAddress(first) : null);
        if (typeof currentChain === "string") {
          setChainId(Number.parseInt(currentChain, 16));
        }
      } catch {
        // Silently treat as disconnected
      }
    };

    void sync();

    const onAccountsChanged = (...args: unknown[]) => {
      const next = Array.isArray(args[0]) ? args[0] : [];
      const first = next[0] && typeof next[0] === "string" && isAddress(next[0]) ? getAddress(next[0]) : null;
      setAccount(first);
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
  }, []);

  // 2. Fetch ecosystem tokens from Blockscout & merge with localStorage custom tokens
  useEffect(() => {
    let cancelled = false;
    setTokensLoading(true);

    const loadTokens = async () => {
      try {
        const remoteTokens = await fetchBlockscoutTokens();
        const customTokens = getStoredCustomTokens();

        if (cancelled) return;

        const mergedMap = new Map<string, TokenInfo>();
        // Add defaults first
        for (const t of DEFAULT_ECOSYSTEM_TOKENS) {
          mergedMap.set(t.address.toLowerCase(), t);
        }
        // Add remote
        for (const t of remoteTokens) {
          mergedMap.set(t.address.toLowerCase(), t);
        }
        // Add custom with override
        for (const t of customTokens) {
          mergedMap.set(t.address.toLowerCase(), { ...t, isCustom: true });
        }

        setTokens(Array.from(mergedMap.values()));
      } finally {
        if (!cancelled) setTokensLoading(false);
      }
    };

    void loadTokens();

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setWalletError(null);
    const injected = provider ?? getEthereumProvider();
    if (!injected) {
      setWalletError("No EVM wallet detected. Install MetaMask or Rabby to swap.");
      return;
    }

    setConnecting(true);
    try {
      const accounts = await injected.request({ method: "eth_requestAccounts" });
      const first = Array.isArray(accounts) && accounts[0] ? (accounts[0] as string) : null;
      if (!first || !isAddress(first)) {
        setWalletError("The wallet returned no account.");
        return;
      }
      setProvider(injected);
      setAccount(getAddress(first));
      const currentChain = await injected.request({ method: "eth_chainId" });
      if (typeof currentChain === "string") {
        setChainId(Number.parseInt(currentChain, 16));
      }
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  const switchToElectroneum = useCallback(async () => {
    setWalletError(null);
    const injected = provider ?? getEthereumProvider();
    if (!injected) return;

    setSwitching(true);
    try {
      const res = await switchChain(injected, ETN_MAINNET.id);
      if (!res.ok) {
        setWalletError(res.message);
        return;
      }
      setChainId(ETN_MAINNET.id);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Network switch failed.");
    } finally {
      setSwitching(false);
    }
  }, [provider]);

  // 3. Read Wallet Balances for Pay & Receive Tokens
  const refreshBalances = useCallback(async () => {
    if (!account) {
      setPayBalance(null);
      setReceiveBalance(null);
      return;
    }

    const client = getReadClient(ETN_MAINNET.id);
    if (!client) return;

    try {
      const [payBal, recBal] = await Promise.all([
        payToken.isNative
          ? client.getBalance({ address: account })
          : client.readContract({
              address: getAddress(payToken.address),
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [account],
            }),
        receiveToken.isNative
          ? client.getBalance({ address: account })
          : client.readContract({
              address: getAddress(receiveToken.address),
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [account],
            }),
      ]);

      setPayBalance(payBal);
      setReceiveBalance(recBal);
    } catch {
      // Keep previous balance
    }
  }, [account, payToken, receiveToken]);

  useEffect(() => {
    void refreshBalances();
    const interval = setInterval(() => void refreshBalances(), 12000);
    return () => clearInterval(interval);
  }, [refreshBalances]);

  // 4. Read Allowance for Pay Token against ElectroSwap V2 Router
  const refreshAllowance = useCallback(async () => {
    if (!account || payToken.isNative) {
      setAllowance(null);
      return;
    }

    const client = getReadClient(ETN_MAINNET.id);
    if (!client) return;

    try {
      const allowed = await client.readContract({
        address: getAddress(payToken.address),
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, ELECTROSWAP_V2_ROUTER_ADDRESS],
      });
      setAllowance(allowed);
    } catch {
      setAllowance(null);
    }
  }, [account, payToken]);

  useEffect(() => {
    void refreshAllowance();
  }, [refreshAllowance]);

  // Parse pay amount in smallest unit (Wei)
  const payAmountWei = useMemo(() => {
    const trimmed = payAmount.trim();
    if (!trimmed || trimmed === "." || Number.isNaN(Number(trimmed)) || Number(trimmed) <= 0) {
      return 0n;
    }
    try {
      return parseUnits(trimmed, payToken.decimals);
    } catch {
      return 0n;
    }
  }, [payAmount, payToken.decimals]);

  // 5. Query Router Quoting with Debounce
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);

    if (payToken.address.toLowerCase() === receiveToken.address.toLowerCase()) {
      setQuote(null);
      return;
    }

    const client = getReadClient(ETN_MAINNET.id);
    if (!client) return;

    setQuoting(true);

    quoteTimerRef.current = setTimeout(async () => {
      try {
        const result = await getSwapQuote(
          payAmountWei,
          payToken,
          receiveToken,
          slippage,
          client
        );
        setQuote(result);
      } catch {
        setQuote(null);
      } finally {
        setQuoting(false);
      }
    }, 250);

    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    };
  }, [payAmountWei, payToken, receiveToken, slippage]);

  // Formatted receive amount string
  const receiveAmount = useMemo(() => {
    if (!quote || quote.amountOutWei <= 0n) return "";
    try {
      return formatUnits(quote.amountOutWei, receiveToken.decimals);
    } catch {
      return "";
    }
  }, [quote, receiveToken.decimals]);

  // Flip Tokens
  const switchTokens = useCallback(() => {
    setPayToken(receiveToken);
    setReceiveToken(payToken);
    if (receiveAmount) {
      setPayAmount(receiveAmount);
    }
  }, [payToken, receiveToken, receiveAmount]);

  // Import Custom Token Handler
  const importCustomToken = useCallback((token: TokenInfo) => {
    const updated = persistCustomToken(token);
    setTokens((prev) => {
      const filtered = prev.filter(
        (t) => t.address.toLowerCase() !== token.address.toLowerCase()
      );
      return [{ ...token, isCustom: true }, ...filtered];
    });
    setPayToken(token);
  }, []);

  const removeCustomToken = useCallback((address: Address) => {
    deleteCustomToken(address);
    setTokens((prev) =>
      prev.filter((t) => t.address.toLowerCase() !== address.toLowerCase())
    );
  }, []);

  // Needs ERC-20 Approval?
  const needsApproval = useMemo(() => {
    if (payToken.isNative) return false;
    if (payAmountWei <= 0n) return false;
    if (allowance === null) return true;
    return allowance < payAmountWei;
  }, [payToken.isNative, payAmountWei, allowance]);

  // Approve Token Action
  const approve = useCallback(async () => {
    if (!account || !provider || payToken.isNative) return;
    setApproving(true);
    setTxError(null);

    const client = getReadClient(ETN_MAINNET.id);
    const wallet = getWalletClient(provider, account, ETN_MAINNET.id);

    try {
      const hash = await wallet.writeContract({
        account,
        address: getAddress(payToken.address),
        abi: erc20Abi,
        functionName: "approve",
        args: [ELECTROSWAP_V2_ROUTER_ADDRESS, maxUint256],
      });

      if (client) {
        await waitForReceipt(client, hash);
      }
      await refreshAllowance();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setApproving(false);
    }
  }, [account, payToken, provider, refreshAllowance]);

  // Execute Swap Action
  const swap = useCallback(async () => {
    if (!account || !provider || !quote || quote.amountOutWei <= 0n) return;
    if (needsApproval) return;

    setSwapPhase("signing");
    setTxError(null);
    setTxHash(null);

    const client = getReadClient(ETN_MAINNET.id);
    const wallet = getWalletClient(provider, account, ETN_MAINNET.id);

    try {
      const hash = await executeSwap({
        wallet,
        account,
        tokenIn: payToken,
        tokenOut: receiveToken,
        quote,
        deadlineMinutes,
      });

      setTxHash(hash);
      setSwapPhase("broadcasting");

      if (client) {
        const receipt = await waitForReceipt(client, hash);
        if (receipt.status === "success") {
          setSwapPhase("confirmed");
          setPayAmount("");
          void refreshBalances();
        } else {
          setSwapPhase("error");
          setTxError("Swap transaction reverted on-chain.");
        }
      } else {
        setSwapPhase("confirmed");
      }
    } catch (err) {
      setSwapPhase("error");
      setTxError(err instanceof Error ? err.message : "Transaction failed.");
    }
  }, [
    account,
    provider,
    quote,
    needsApproval,
    payToken,
    receiveToken,
    deadlineMinutes,
    refreshBalances,
  ]);

  const resetTx = useCallback(() => {
    setSwapPhase("idle");
    setTxHash(null);
    setTxError(null);
  }, []);

  return {
    account,
    chainId,
    chainOk,
    connecting,
    switching,
    walletError,
    connect,
    switchToElectroneum,

    tokens,
    tokensLoading,
    payToken,
    setPayToken,
    receiveToken,
    setReceiveToken,
    switchTokens,
    importCustomToken,
    removeCustomToken,

    payBalance,
    receiveBalance,
    refreshBalances,

    payAmount,
    setPayAmount,
    payAmountWei,
    receiveAmount,
    quote,
    quoting,

    slippage,
    setSlippage,
    deadlineMinutes,
    setDeadlineMinutes,

    allowance,
    needsApproval,
    approving,
    approve,

    swap,
    swapPhase,
    txHash,
    txError,
    resetTx,
  };
}
