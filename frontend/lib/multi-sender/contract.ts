import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  fallback,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hash,
  type PublicClient,
} from "viem";

import { getViemChain, getViemChainOrDefault } from "@/lib/etn-chain";
import {
  ETN_MAINNET,
  ETN_NATIVE_DECIMALS,
  ETN_TESTNET,
  RPC_REQUEST_TIMEOUT_MS,
  getEtnChain,
  getEtnChainOrDefault,
} from "@/lib/etn";
import type { Eip1193Provider } from "@/lib/wallet";

import { pulseMultiSenderAbi } from "./abi";
import type { RecipientBatch } from "./parse";

/**
 * Contract wiring for the batch sender.
 *
 * The deployment addresses are build-time public env vars, because the contract
 * lives on chain rather than in this repo. When one is missing or malformed the
 * module degrades to a readable "not configured" state instead of throwing:
 * every build of the dashboard stays usable for parsing and validating a list
 * even before a deployment exists, and a mainnet-only deployment still works.
 */

/**
 * Parses an address out of a public env var, tolerating anything malformed.
 *
 * A bad value must not throw at import time: this module is pulled into the
 * dashboard bundle, and a typo in a deployment variable would otherwise take the
 * whole page down rather than degrading to "not configured".
 */
function parseAddress(raw: string | undefined): Address | null {
  const value = (raw ?? "").trim();
  if (!value || !isAddress(value, { strict: false })) return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

/**
 * One deployment address per supported chain.
 *
 * The contract is deployed separately to each network and a mainnet address
 * means nothing on testnet, so the mapping is keyed by chain id and resolved at
 * call time from the connected wallet's chain. `NEXT_PUBLIC_MULTISENDER_ADDRESS`
 * is still honoured as the mainnet value so deployments made before testnet
 * support keep working without a rename.
 */
export const MULTISENDER_ADDRESSES: Readonly<Record<number, Address | null>> = {
  [ETN_MAINNET.id]: parseAddress(
    process.env.NEXT_PUBLIC_MULTISENDER_MAINNET ?? process.env.NEXT_PUBLIC_MULTISENDER_ADDRESS,
  ),
  [ETN_TESTNET.id]: parseAddress(process.env.NEXT_PUBLIC_MULTISENDER_TESTNET),
};

/** Deployment address for a chain, or null when that network has none configured. */
export function getMultiSenderAddress(chainId: number | null | undefined): Address | null {
  if (typeof chainId !== "number") return null;
  return MULTISENDER_ADDRESSES[chainId] ?? null;
}

/** True when the given chain is supported *and* has a deployed contract. */
export function isMultiSenderConfigured(chainId: number | null | undefined): boolean {
  return getMultiSenderAddress(chainId) !== null;
}

/** True when at least one network has a deployment; drives the module-level notice. */
export const hasAnyMultiSenderDeployment: boolean = Object.values(MULTISENDER_ADDRESSES).some(
  (address) => address !== null,
);

/** Mirrors the contract constant; the chain value wins when it can be read. */
export const FALLBACK_MAX_BATCH_SIZE = 200;

export const NATIVE_DECIMALS = ETN_NATIVE_DECIMALS;

export const ERC20_ABI = erc20Abi;

export const MULTI_SENDER_ABI = pulseMultiSenderAbi;

/**
 * Explorer links follow the chain the transaction was actually sent on, not the
 * chain the app happens to default to: a mainnet link for a testnet hash is a
 * dead end, and vice versa. When no supported chain is connected the mainnet
 * explorer is used for display purposes only.
 */
export function explorerTxUrl(chainId: number | null | undefined, hash: string): string {
  return `${getEtnChainOrDefault(chainId).explorerUrl}/tx/${hash}`;
}

export function explorerAddressUrl(chainId: number | null | undefined, address: string): string {
  return `${getEtnChainOrDefault(chainId).explorerUrl}/address/${address}`;
}

const readClients = new Map<number, PublicClient>();

/**
 * Read-only client for a chain, with a fallback transport.
 *
 * Balances, token metadata and allowances are read far more often than batches
 * are sent, and a single unresponsive node would otherwise stall the whole
 * panel. viem's `fallback` moves to the next endpoint when one errors, honours
 * the same per-request timeout the monitoring engine uses, and ranks the
 * endpoints by observed latency.
 *
 * Returns null for an unsupported chain rather than silently substituting
 * mainnet. Reading a testnet wallet's balance from mainnet would be wrong in a
 * way that looks like a real answer, which is the one failure mode worth typing
 * out of existence. Clients are memoised per chain so the pool stays warm.
 */
export function getReadClient(chainId: number | null | undefined): PublicClient | null {
  if (typeof chainId !== "number") return null;

  const cached = readClients.get(chainId);
  if (cached) return cached;

  const chain = getEtnChain(chainId);
  const viemChain = getViemChain(chainId);
  if (!chain || !viemChain) return null;

  const client = createPublicClient({
    chain: viemChain,
    transport: fallback(
      chain.rpcUrls.map((url) => http(url, { timeout: RPC_REQUEST_TIMEOUT_MS, retryCount: 1 })),
      { rank: false },
    ),
  });

  readClients.set(chainId, client);
  return client;
}

/**
 * Wallet client over the injected provider.
 *
 * viem's `custom` transport forwards to EIP-1193, so signing, chain switching
 * and account changes stay the wallet's business. The account is fixed at
 * construction: the hook rebuilds this client whenever the wallet reports a
 * different address, which keeps every write bound to the account the UI shows.
 */
export function getWalletClient(provider: Eip1193Provider, account: Address, chainId: number) {
  return createWalletClient({
    account,
    chain: getViemChainOrDefault(chainId),
    transport: custom(provider),
  });
}

/**
 * Concrete wallet-client type of this app.
 *
 * Written as `ReturnType<typeof getWalletClient>` rather than the bare
 * `WalletClient`: the unparameterised alias loses the chain and account type
 * arguments, which turns every `writeContract` call into a type error demanding
 * an explicit `chain: null`. Letting inference carry them keeps the calls (and
 * the ABI-derived argument types) checked.
 */
export type EtnWalletClient = ReturnType<typeof getWalletClient>;

export interface TokenMetadata {
  symbol: string;
  decimals: number;
}

/**
 * Reads token metadata defensively.
 *
 * `decimals` decides how every pasted amount is scaled, so it is read from the
 * contract rather than assumed: getting it wrong by a factor of 10^12 is the
 * single most expensive mistake this tool could make. A token that does not
 * implement the optional metadata methods reports zero/empty and the UI says so.
 */
export async function readTokenMetadata(
  client: PublicClient,
  token: Address,
): Promise<TokenMetadata> {
  const [symbol, decimals] = await Promise.all([
    client
      .readContract({ address: token, abi: erc20Abi, functionName: "symbol" })
      .catch(() => "" as const),
    client
      .readContract({ address: token, abi: erc20Abi, functionName: "decimals" })
      .catch(() => null),
  ]);

  return {
    symbol: typeof symbol === "string" && symbol.length > 0 ? symbol : "TOKEN",
    decimals: typeof decimals === "number" ? decimals : 18,
  };
}

export function readNativeBalance(client: PublicClient, owner: Address): Promise<bigint> {
  return client.getBalance({ address: owner });
}

export function readTokenBalance(client: PublicClient, token: Address, owner: Address): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

export function readAllowance(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

/**
 * The contract's own batch ceiling.
 *
 * Read from chain so a redeployed contract with a different constant cannot
 * silently disagree with the UI's chunking; the fallback only applies while the
 * contract is unreachable or unconfigured.
 */
export async function readMaxBatchSize(
  client: PublicClient,
  chainId: number | null | undefined,
): Promise<number> {
  const address = getMultiSenderAddress(chainId);
  if (!address) return FALLBACK_MAX_BATCH_SIZE;

  try {
    const value = await client.readContract({
      address,
      abi: pulseMultiSenderAbi,
      functionName: "MAX_BATCH_SIZE",
    });
    return value > 0n ? Number(value) : FALLBACK_MAX_BATCH_SIZE;
  } catch {
    return FALLBACK_MAX_BATCH_SIZE;
  }
}

function requireAddress(chainId: number): Address {
  const address = getMultiSenderAddress(chainId);
  if (!address) {
    throw new Error(`The batch sender contract is not configured for chain ${chainId}.`);
  }
  return address;
}

/**
 * The chain id is passed explicitly rather than read off the wallet client.
 *
 * viem types `wallet.chain` as possibly-undefined even when a chain was passed
 * at construction, and the address and the chain the wallet is actually on must
 * agree: resolving both from one argument is what makes that checkable.
 */
export function sendNativeBatch(
  wallet: EtnWalletClient,
  chainId: number,
  batch: RecipientBatch,
): Promise<Hash> {
  return wallet.writeContract({
    address: requireAddress(chainId),
    abi: pulseMultiSenderAbi,
    functionName: "batchSendNative",
    args: [batch.recipients, batch.amounts],
    value: batch.totalWei,
  });
}

export function sendTokenBatch(
  wallet: EtnWalletClient,
  chainId: number,
  token: Address,
  batch: RecipientBatch,
): Promise<Hash> {
  return wallet.writeContract({
    address: requireAddress(chainId),
    abi: pulseMultiSenderAbi,
    functionName: "batchSendERC20",
    args: [token, batch.recipients, batch.amounts],
  });
}

export function approveToken(
  wallet: EtnWalletClient,
  chainId: number,
  token: Address,
  amount: bigint,
): Promise<Hash> {
  return wallet.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [requireAddress(chainId), amount],
  });
}

export interface SendErrorCopy {
  title: string;
  detail: string;
}

/**
 * Revert reasons, translated.
 *
 * The contract's `require` strings are written for a developer reading a trace,
 * not for someone who just pasted 40 addresses. Every reason the contract can
 * emit is mapped to what actually happened and what to do about it; anything
 * unmapped falls through to viem's `shortMessage` rather than being hidden.
 */
const REVERT_COPY: Record<string, SendErrorCopy> = {
  "msg.value != total": {
    title: "The batch total changed",
    detail: "The amount sent did not match the list that was signed. Nothing was sent - press Send again.",
  },
  "length mismatch": {
    title: "Malformed batch",
    detail: "The address and amount lists had different lengths. Reload the page and rebuild the list.",
  },
  "empty batch": {
    title: "Nothing to send",
    detail: "The batch contained no recipients.",
  },
  "batch too large": {
    title: "Too many recipients",
    detail: "This batch exceeded the contract limit. Larger lists are split into several transactions automatically.",
  },
  "zero recipient": {
    title: "A recipient is the zero address",
    detail: "One row resolves to 0x0000...0000, which would burn the funds. Remove it and retry.",
  },
  "zero amount": {
    title: "A row has a zero amount",
    detail: "Every amount must be greater than zero. Remove the row or fill in its amount.",
  },
  "native transfer failed": {
    title: "A recipient rejected the ETN",
    detail:
      "One transfer reverted. This happens when a recipient is a contract that refuses plain ETN, or when it runs out of gas on receive.",
  },
  "no native value": {
    title: "Unexpected ETN attached",
    detail: "Token batches must not carry native value. Close the wallet prompt and send again.",
  },
  "zero token": {
    title: "No token address",
    detail: "Enter the token contract address before sending.",
  },
  SafeERC20FailedOperation: {
    title: "The token refused the transfer",
    detail:
      "Most often a missing or insufficient allowance, or a token that does not return a standard transfer result.",
  },
  ReentrancyGuardReentrantCall: {
    title: "Re-entrant call rejected",
    detail: "The contract blocked a nested call. This is a safety guard - no funds moved.",
  },
};

function errorCode(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return null;
}

export function describeSendError(error: unknown): SendErrorCopy {
  if (error instanceof UserRejectedRequestError || errorCode(error) === 4001) {
    return {
      title: "Signature declined",
      detail: "Nothing was sent. Approve the request in your wallet to run the batch.",
    };
  }

  if (error instanceof BaseError) {
    // viem wraps the revert in a chain of causes; `walk` finds the typed one so
    // custom errors are matched by name and require strings by reason.
    const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const reason = reverted.reason;
      const name = reverted.data?.errorName;
      const copy = (reason && REVERT_COPY[reason]) || (name && REVERT_COPY[name]);

      if (copy) return copy;

      return {
        title: "Transaction reverted",
        detail: reason ?? name ?? "The contract rejected the batch without a reason.",
      };
    }

    const short = error.shortMessage ?? error.message;
    const insufficient = /insufficient funds|exceeds the balance/i.test(short);

    return {
      title: insufficient ? "Insufficient balance" : "Transaction failed",
      detail: insufficient
        ? "Your wallet could not cover the batch plus gas. Lower the amounts or top up and retry."
        : short,
    };
  }

  return {
    title: "Transaction failed",
    detail: error instanceof Error ? error.message : "Unknown error while sending the batch.",
  };
}
