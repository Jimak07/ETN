"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAddress, isAddress, type Address, type Hash } from "viem";

import {
  FALLBACK_MAX_BATCH_SIZE,
  approveToken,
  describeSendError,
  getMultiSenderAddress,
  getReadClient,
  getWalletClient,
  hasAnyMultiSenderDeployment,
  isMultiSenderConfigured,
  isReceiptTimeout,
  pollExplorerReceiptStatus,
  readAllowance,
  readMaxBatchSize,
  readNativeBalance,
  readTokenBalance,
  readTokenMetadata,
  sendNativeBatch,
  sendTokenBatch,
  waitForReceipt,
  type SendErrorCopy,
} from "@/lib/multi-sender/contract";
import { planBatches, type RecipientRow } from "@/lib/multi-sender/parse";
import {
  DEFAULT_CHAIN_ID,
  SUPPORTED_CHAINS,
  findPopularToken,
  getChainConfigOrDefault,
  isSupportedChain,
  type ChainConfig,
} from "@/lib/chains";
import { getEthereumProvider, switchChain, type Eip1193Provider } from "@/lib/wallet";

/**
 * Wallet + send state machine for the batch sender.
 *
 * Split of responsibilities: parsing and validation are pure functions in
 * `lib/multi-sender/parse.ts`, chain reads and writes are viem calls in
 * `lib/multi-sender/contract.ts`, and this hook owns only the *sequence* - what
 * is connected, what it can spend, and which step of a multi-transaction run is
 * in flight. Keeping the sequence in one place is what makes a 1,000-recipient
 * run resumable and reportable instead of a fire-and-forget loop in a component.
 */

/**
 * What is being sent.
 *
 * Three kinds rather than a boolean, because "token" covers two very different
 * intents: picking one of the recognised tokens, where the address and decimals
 * are known before the user clicks, and pasting an arbitrary contract, where
 * they have to be read from the chain.
 */
export type AssetKind = "native" | "popular" | "custom";

/**
 * `signing`      -> the wallet is waiting for the user (approval or batch).
 * `broadcasting` -> a hash exists and the receipt is pending. The transaction is
 *                   already irreversible at this point, which is why the UI
 *                   presents it as a success rather than as a spinner.
 * `confirmed`    -> a receipt arrived and every transfer landed.
 * `unconfirmed`  -> we stopped waiting for a receipt. Not a failure: the
 *                   transaction was broadcast, we simply never saw it mined.
 *                   Kept distinct from `error` so a slow testnet RPC can never
 *                   render as a red "Failed" banner.
 * `error`        -> nothing was broadcast (declined, reverted, unfunded).
 */
export type SendPhase = "idle" | "signing" | "broadcasting" | "confirmed" | "unconfirmed" | "error";

export type SendStep = "approval" | "batch";

export interface SendProgress {
  phase: SendPhase;
  step: SendStep;
  /** 1-based index of the batch being signed or mined. */
  batchIndex: number;
  batchCount: number;
  recipientCount: number;
  /** Hash of the batch in flight, or of the last confirmed one. */
  hash: Hash | null;
  approvalHash: Hash | null;
  error: SendErrorCopy | null;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface TokenState {
  address: Address | null;
  symbol: string;
  decimals: number;
  balance: bigint | null;
  allowance: bigint | null;
  loading: boolean;
  error: string | null;
}

const IDLE_PROGRESS: SendProgress = {
  phase: "idle",
  step: "batch",
  batchIndex: 1,
  batchCount: 1,
  recipientCount: 0,
  hash: null,
  approvalHash: null,
  error: null,
  startedAt: null,
  finishedAt: null,
};

const BALANCE_POLL_MS = 12_000;

function asAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function asChainId(value: unknown): number | null {
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.startsWith("0x") ? value.slice(2) : value, 16);
    return Number.isInteger(parsed) ? parsed : null;
  }
  if (typeof value === "number" && Number.isInteger(value)) return value;
  return null;
}

async function requestAccounts(provider: Eip1193Provider): Promise<Address | null> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts)) return null;
  return asAddress(accounts[0]);
}

export function useMultiSender() {
  const [provider, setProvider] = useState<Eip1193Provider | null>(null);
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [asset, setAsset] = useState<AssetKind>("native");
  const [tokenAddress, setTokenAddress] = useState("");

  /**
   * A network change invalidates the asset selection.
   *
   * A token address means nothing across chains - the same string is a different
   * contract elsewhere, or no contract at all - so the picker falls back to the
   * native coin rather than letting the old address be re-interpreted on the new
   * chain. Amounts already typed are left alone: those are the user's numbers.
   */
  useEffect(() => {
    setAsset("native");
    setTokenAddress("");
  }, [chainId]);

  const [nativeBalance, setNativeBalance] = useState<bigint | null>(null);
  const [token, setToken] = useState<TokenState>({
    address: null,
    symbol: "TOKEN",
    decimals: 18,
    balance: null,
    allowance: null,
    loading: false,
    error: null,
  });
  const [maxBatchSize, setMaxBatchSize] = useState(FALLBACK_MAX_BATCH_SIZE);
  const [progress, setProgress] = useState<SendProgress>(IDLE_PROGRESS);

  const sendingRef = useRef(false);
  /**
   * Cancels an in-flight explorer poll.
   *
   * Aborted on unmount and whenever a run is dismissed, so a late explorer answer
   * cannot reopen a modal the user has already closed.
   */
  const explorerWatchRef = useRef<AbortController | null>(null);

  useEffect(() => () => explorerWatchRef.current?.abort(), []);

  // Only a chain this app can actually act on counts as "ok": a wallet parked on
  // some unrelated EVM network is a blocking state, not an implicit mainnet.
  const chainOk = isSupportedChain(chainId);
  /** Descriptor for the live chain, or mainnet as a display placeholder. */
  const chain: ChainConfig = getChainConfigOrDefault(chainId);
  /** Deployment address for the connected chain, resolved per render. */
  const contractAddress = getMultiSenderAddress(chainId);
  const configured = isMultiSenderConfigured(chainId);

  // --- wallet detection -----------------------------------------------------

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
        setAccount(Array.isArray(accounts) ? asAddress(accounts[0]) : null);
        setChainId(asChainId(currentChain));
      } catch {
        // A wallet that refuses to answer is treated as disconnected rather
        // than as an error: nothing has been requested from the user yet.
      }
    };

    void sync();

    const onAccountsChanged = (...args: unknown[]) => {
      const next = Array.isArray(args[0]) ? args[0] : [];
      setAccount(asAddress(next[0]));
    };
    const onChainChanged = (...args: unknown[]) => setChainId(asChainId(args[0]));

    // EIP-1193 providers expose `on`/`removeListener`; the injected interface
    // here is a narrow subset, so the event methods are probed rather than
    // assumed (some wallet in-app browsers omit them).
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

  const connect = useCallback(async () => {
    setConnectionError(null);
    const injected = provider ?? getEthereumProvider();

    if (!injected) {
      setConnectionError("No EVM wallet detected. Install MetaMask or Rabby to send a batch.");
      return;
    }

    setConnecting(true);
    try {
      const next = await requestAccounts(injected);
      if (!next) {
        setConnectionError("The wallet returned no account.");
        return;
      }
      setProvider(injected);
      setAccount(next);

      // Connecting reports the chain rather than correcting it. Two Electroneum
      // networks are supported, so silently moving the wallet could sign a
      // mainnet batch the user meant for testnet - the panel asks instead.
      setChainId(asChainId(await injected.request({ method: "eth_chainId" })));
    } catch (error) {
      setConnectionError(describeSendError(error).detail);
    } finally {
      setConnecting(false);
    }
  }, [provider]);

  /**
   * Move the connected wallet onto one of the supported networks.
   *
   * Always user-initiated: the app cannot know which of the two networks a given
   * batch is meant for, and guessing wrong means sending real ETN instead of
   * testnet ETN. The chain is re-read from the provider afterwards because the
   * `chainChanged` event is missing on some wallets.
   */
  const switchTo = useCallback(
    async (target: number = DEFAULT_CHAIN_ID) => {
      setConnectionError(null);
      const injected = provider ?? getEthereumProvider();

      if (!injected) {
        setConnectionError("No EVM wallet detected. Install MetaMask or Rabby to switch networks.");
        return;
      }

      setSwitching(true);
      try {
        const result = await switchChain(injected, target);
        if (!result.ok) {
          setConnectionError(result.message);
          return;
        }
        setChainId(asChainId(await injected.request({ method: "eth_chainId" })));
      } catch (error) {
        setConnectionError(describeSendError(error).detail);
      } finally {
        setSwitching(false);
      }
    },
    [provider],
  );

  // --- balances -------------------------------------------------------------

  const refreshNativeBalance = useCallback(async () => {
    if (!account) {
      setNativeBalance(null);
      return;
    }

    const client = getReadClient(chainId);
    if (!client) {
      // An unsupported chain has no client at all. Clearing rather than keeping
      // the last value stops a mainnet balance being shown beside a testnet
      // wallet, which is the kind of stale number that gets a batch sent.
      setNativeBalance(null);
      return;
    }

    try {
      const balance = await readNativeBalance(client, account);
      setNativeBalance(balance);
    } catch {
      // A failed read leaves the previous value in place; the panel marks it
      // stale rather than showing a wrong zero.
    }
  }, [account, chainId]);

  useEffect(() => {
    if (!account) {
      setNativeBalance(null);
      return;
    }

    void refreshNativeBalance();
    const timer = setInterval(() => void refreshNativeBalance(), BALANCE_POLL_MS);
    return () => clearInterval(timer);
  }, [account, refreshNativeBalance]);

  useEffect(() => {
    const client = getReadClient(chainId);
    if (!client) {
      setMaxBatchSize(FALLBACK_MAX_BATCH_SIZE);
      return;
    }

    let cancelled = false;

    void (async () => {
      const size = await readMaxBatchSize(client, chainId);
      if (!cancelled) setMaxBatchSize(size);
    })();

    return () => {
      cancelled = true;
    };
  }, [chainId]);

  // Token resolution, per asset kind. The address is what every branch keys on:
  // the `popular` path takes its symbol and decimals from the local list, which
  // is what makes it one click, while `custom` reads them from the contract
  // itself - `decimals` decides how every amount in the table is scaled, and
  // guessing it is the most expensive mistake this tool could make.
  useEffect(() => {
    const trimmed = tokenAddress.trim();
    if (trimmed.length === 0) {
      setToken((previous) => ({
        ...previous,
        address: null,
        symbol: "TOKEN",
        balance: null,
        allowance: null,
        loading: false,
        error: null,
      }));
      return;
    }

    const parsed = asAddress(trimmed);
    if (!parsed) {
      setToken((previous) => ({
        ...previous,
        address: null,
        balance: null,
        allowance: null,
        loading: false,
        error: "That is not a valid contract address.",
      }));
      return;
    }

    const client = getReadClient(chainId);
    if (!client) {
      setToken((previous) => ({
        ...previous,
        address: parsed,
        balance: null,
        allowance: null,
        loading: false,
        error: `Switch to a supported network to read a token on ${chain.name}.`,
      }));
      return;
    }

    // Listed tokens are trusted for symbol and decimals; anything else is read
    // from the contract below.
    const listed = asset === "popular" ? findPopularToken(chainId, parsed) : null;
    if (asset === "popular" && !listed) {
      setToken((previous) => ({
        ...previous,
        address: null,
        balance: null,
        allowance: null,
        loading: false,
        error: `That token is not listed on ${chain.name}.`,
      }));
      return;
    }

    let cancelled = false;
    setToken((previous) => ({
      ...previous,
      address: parsed,
      symbol: listed?.symbol ?? previous.symbol,
      decimals: listed?.decimals ?? previous.decimals,
      loading: true,
      error: null,
    }));

    void (async () => {
      try {
        const metadata = listed ?? (await readTokenMetadata(client, parsed));
        // The allowance is only meaningful once there is a spender to approve,
        // and that spender is the deployment for the connected chain.
        const [balance, allowance] =
          account && contractAddress
            ? await Promise.all([
                readTokenBalance(client, parsed, account),
                readAllowance(client, parsed, account, contractAddress),
              ])
            : [null, null];

        if (cancelled) return;
        setToken({
          address: parsed,
          symbol: metadata.symbol,
          decimals: metadata.decimals,
          balance,
          allowance,
          loading: false,
          error: null,
        });
      } catch {
        if (cancelled) return;
        setToken({
          address: parsed,
          symbol: "TOKEN",
          decimals: 18,
          balance: null,
          allowance: null,
          loading: false,
          error: "Could not read that token. Check the address and the network.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asset, tokenAddress, account, chainId, contractAddress, chain.name]);

  const refreshToken = useCallback(async () => {
    if (!token.address || !account) return;
    const client = getReadClient(chainId);
    if (!client || !contractAddress) return;

    try {
      const [balance, allowance] = await Promise.all([
        readTokenBalance(client, token.address, account),
        readAllowance(client, token.address, account, contractAddress),
      ]);
      setToken((previous) => ({ ...previous, balance, allowance }));
    } catch {
      // Same reasoning as the native balance: keep the last good value.
    }
  }, [account, chainId, contractAddress, token.address]);

  // --- sending --------------------------------------------------------------

  const send = useCallback(
    async (rows: readonly RecipientRow[]) => {
      if (sendingRef.current) return;

      const fail = (title: string, detail: string) =>
        setProgress({
          ...IDLE_PROGRESS,
          phase: "error",
          error: { title, detail },
          finishedAt: Date.now(),
        });

      if (!account || !provider) {
        fail("Wallet not connected", "Connect a wallet before sending a batch.");
        return;
      }
      if (!chainOk) {
        fail(
          "Wrong network",
          `Switch your wallet to a supported network (${SUPPORTED_CHAINS.map((option) => option.name).join(
            ", ",
          )}) before sending a batch.`,
        );
        return;
      }
      // Checked after the chain, because whether a contract is configured
      // depends on which chain the wallet is on.
      if (!configured || !contractAddress) {
        fail(
          "Contract not configured",
          `No PulseMultiSender deployment is configured for ${chain.name} (chain ${chain.id}). Set the matching NEXT_PUBLIC_MULTISENDER_* variable and rebuild.`,
        );
        return;
      }

      const batches = planBatches(rows, maxBatchSize);
      if (batches.length === 0) {
        fail("Nothing to send", "Fix the highlighted rows, then send again.");
        return;
      }

      const totalWei = batches.reduce((sum, batch) => sum + batch.totalWei, 0n);
      const recipientCount = batches.reduce((sum, batch) => sum + batch.recipients.length, 0);
      const spendable = asset === "native" ? nativeBalance : token.balance;

      if (asset !== "native" && token.address === null) {
        fail("No token selected", "Enter the token contract address before sending.");
        return;
      }
      if (spendable !== null && totalWei > spendable) {
        fail(
          "Insufficient balance",
          asset === "native"
            ? "The batch plus gas costs more than this wallet holds."
            : `This wallet does not hold ${token.symbol} enough to cover the batch.`,
        );
        return;
      }

      const client = getReadClient(chainId);
      if (!client || typeof chainId !== "number") {
        fail("Wrong network", "No RPC client for the connected chain. Switch networks and retry.");
        return;
      }

      const wallet = getWalletClient(provider, account, chainId);
      const startedAt = Date.now();
      sendingRef.current = true;

      setProgress({
        ...IDLE_PROGRESS,
        phase: "signing",
        step: asset !== "native" ? "approval" : "batch",
        batchIndex: 1,
        batchCount: batches.length,
        recipientCount,
        startedAt,
      });

      /**
       * Waits for a receipt and reports which of the two outcomes happened.
       *
       * Returns "unconfirmed" instead of throwing when the wait times out. The
       * caller then stops the run: continuing to later batches while an earlier
       * one is unobserved would send a partial airdrop with no way to tell which
       * half landed. Reverting receipts still throw, because those genuinely
       * failed on chain.
       */

      /**
       * Keeps asking the explorer after the RPC has given up.
       *
       * A timed-out receipt wait means *we stopped asking*, not that the batch
       * failed, and the explorer indexes independently of the node we were
       * talking to. It is asked on the chain the wallet is on, so a testnet hash
       * is checked against the testnet explorer.
       *
       * A definite answer settles the run properly: success turns the amber
       * "still confirming" into the confirmed state, and only a proven revert
       * turns it red. Anything else - still indexing, or a request that never
       * landed - leaves the user exactly where they were, with the manual
       * explorer link.
       */
      const watchExplorer = (
        hash: Hash,
        step: SendStep,
        batchIndex: number,
        revertedMessage: string,
      ) => {
        explorerWatchRef.current?.abort();
        const controller = new AbortController();
        explorerWatchRef.current = controller;

        void (async () => {
          const status = await pollExplorerReceiptStatus(chainId, hash, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;

          // The state is re-checked before it is written: a slow answer from an
          // earlier run must not land on top of a newer one, or reopen a modal
          // the user has dismissed.
          if (status === "success") {
            setProgress((previous) =>
              previous.phase === "unconfirmed" && previous.hash === hash
                ? { ...previous, phase: "confirmed", step, batchIndex, hash, finishedAt: Date.now() }
                : previous,
            );
            void refreshNativeBalance();
            void refreshToken();
            return;
          }

          if (status === "failed") {
            setProgress((previous) =>
              previous.phase === "unconfirmed" && previous.hash === hash
                ? {
                    ...previous,
                    phase: "error",
                    error: {
                      title: "Transaction reverted",
                      detail: `${revertedMessage} The explorer confirms it failed on chain, so nothing was sent.`,
                    },
                    finishedAt: Date.now(),
                  }
                : previous,
            );
          }
        })();
      };

      const settle = async (
        hash: Hash,
        step: SendStep,
        batchIndex: number,
        revertedMessage: string,
      ): Promise<"confirmed" | "unconfirmed"> => {
        try {
          const receipt = await waitForReceipt(client, hash);
          if (receipt.status !== "success") {
            throw new Error(revertedMessage);
          }
          return "confirmed";
        } catch (error) {
          if (!isReceiptTimeout(error)) throw error;
          setProgress((previous) => ({
            ...previous,
            phase: "unconfirmed",
            step,
            batchIndex,
            hash,
            finishedAt: Date.now(),
          }));
          watchExplorer(hash, step, batchIndex, revertedMessage);
          return "unconfirmed";
        }
      };

      try {
        if (asset !== "native" && token.address) {
          const allowance = token.allowance ?? 0n;

          if (allowance < totalWei) {
            // Some tokens (notably USDT on Ethereum) revert on approve() if an existing
            // non-zero allowance is changed directly to another non-zero amount.
            // Reset to 0 first if allowance is non-zero to guarantee execution.
            if (allowance > 0n) {
              const resetHash = await approveToken(wallet, chainId, token.address, 0n);
              const resetOutcome = await settle(
                resetHash,
                "approval",
                1,
                "The token allowance reset transaction reverted.",
              );
              if (resetOutcome === "unconfirmed") return;
            }

            // Exact allowance, not an unlimited one: the contract can then never
            // move more than the batch the user actually approved, and a leaked
            // approval is worth only the run it was granted for.
            const approvalHash = await approveToken(wallet, chainId, token.address, totalWei);
            setProgress((previous) => ({
              ...previous,
              phase: "broadcasting",
              step: "approval",
              approvalHash,
              hash: approvalHash,
            }));

            // The batch cannot be built until the allowance is known to exist,
            // so an unobserved approval ends the run rather than being retried.
            const approvalOutcome = await settle(
              approvalHash,
              "approval",
              1,
              "The token approval transaction reverted.",
            );
            if (approvalOutcome === "unconfirmed") return;

            await refreshToken();
          }
        }

        let lastHash: Hash | null = null;

        for (const batch of batches) {
          setProgress((previous) => ({
            ...previous,
            phase: "signing",
            step: "batch",
            batchIndex: batch.index,
            hash: lastHash,
          }));

          const hash =
            asset === "native"
              ? await sendNativeBatch(wallet, chainId, batch)
              : await sendTokenBatch(wallet, chainId, token.address as Address, batch);

          lastHash = hash;
          setProgress((previous) => ({
            ...previous,
            phase: "broadcasting",
            step: "batch",
            batchIndex: batch.index,
            hash,
          }));

          const outcome = await settle(
            hash,
            "batch",
            batch.index,
            `Batch ${batch.index} was mined but reverted.`,
          );
          if (outcome === "unconfirmed") return;
        }

        setProgress((previous) => ({
          ...previous,
          phase: "confirmed",
          hash: lastHash,
          finishedAt: Date.now(),
        }));

        void refreshNativeBalance();
        void refreshToken();
      } catch (error) {
        setProgress((previous) => ({
          ...previous,
          phase: "error",
          error: describeSendError(error),
          finishedAt: Date.now(),
        }));
      } finally {
        sendingRef.current = false;
      }
    },
    [
      account,
      chain.id,
      chain.name,
      chainId,
      chainOk,
      configured,
      contractAddress,
      maxBatchSize,
      asset,
      nativeBalance,
      provider,
      refreshNativeBalance,
      refreshToken,
      token.address,
      token.allowance,
      token.balance,
      token.symbol,
    ],
  );

  const reset = useCallback(() => {
    explorerWatchRef.current?.abort();
    explorerWatchRef.current = null;
    setProgress(IDLE_PROGRESS);
  }, []);

  const sendBusy = progress.phase === "signing" || progress.phase === "broadcasting";

  /** Everything the amount column and the totals are scaled by. */
  const decimals = asset === "native" ? chain.nativeCurrency.decimals : token.decimals;
  const symbol = asset === "native" ? chain.nativeCurrency.symbol : token.symbol;
  const spendableBalance = asset === "native" ? nativeBalance : token.balance;

  return {
    provider,
    account,
    chainId,
    chainOk,
    chain,
    contractAddress,
    switching,
    switchTo,
    connecting,
    connectionError,
    connect,
    asset,
    setAsset,
    tokenAddress,
    setTokenAddress,
    token,
    symbol,
    decimals,
    spendableBalance,
    nativeBalance,
    refreshNativeBalance,
    refreshToken,
    maxBatchSize,
    progress,
    send,
    reset,
    sendBusy,
    configured,
    configuredAnywhere: hasAnyMultiSenderDeployment,
  };
}
