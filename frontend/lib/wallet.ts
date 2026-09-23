import {
  DEFAULT_ETN_CHAIN,
  getEtnChain,
  type EtnChainConfig,
} from "./etn";

interface Eip1193RequestArguments {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

/** Minimal EIP-1193 provider surface (MetaMask, Rabby, Coinbase, ...). */
export interface Eip1193Provider {
  request(args: Eip1193RequestArguments): Promise<unknown>;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export const METAMASK_DOWNLOAD_URL = "https://metamask.io/download/";

/** EIP-3085 payload for `wallet_addEthereumChain`, built per network. */
export function etnChainParams(chain: EtnChainConfig) {
  return {
    chainId: chain.idHex,
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [...chain.rpcUrls],
    blockExplorerUrls: [chain.explorerUrl],
  };
}

/** Mainnet payload, for callers that only ever add the flagship network. */
export const ETN_WALLET_CHAIN_PARAMS = etnChainParams(DEFAULT_ETN_CHAIN);

export type WalletOutcome = "added" | "switched" | "no-provider" | "rejected" | "unsupported" | "error";

export interface WalletResult {
  ok: boolean;
  outcome: WalletOutcome;
  message: string;
}

export function getEthereumProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

function errorCode(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "number") return code;
  }
  return null;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

/**
 * Request that the injected wallet add + select an Electroneum network.
 *
 * Wallets implement this inconsistently, so we try the additive call first and
 * fall back to a switch (and vice versa for error 4902 / unknown chain).
 */
export async function addEtnToWallet(
  provider: Eip1193Provider | null = getEthereumProvider(),
  chainId: number = DEFAULT_ETN_CHAIN.id,
): Promise<WalletResult> {
  const chain = getEtnChain(chainId);
  if (!chain) {
    return { ok: false, outcome: "unsupported", message: `Chain ${chainId} is not an Electroneum network.` };
  }

  if (!provider) {
    return {
      ok: false,
      outcome: "no-provider",
      message: `No EVM wallet detected. Install MetaMask to add ${chain.name} (chain ${chain.id}).`,
    };
  }

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [etnChainParams(chain)],
    });
  } catch (error) {
    const code = errorCode(error);

    if (code === 4001) {
      return { ok: false, outcome: "rejected", message: "Request rejected in your wallet." };
    }

    if (code === -32601 || code === -32602) {
      return {
        ok: false,
        outcome: "unsupported",
        message: "This wallet cannot add networks programmatically. Add ETN manually from the explorer.",
      };
    }

    if (code !== 4902) {
      return {
        ok: false,
        outcome: "error",
        message: errorMessage(error, "Wallet rejected the request."),
      };
    }
    // 4902 => chain unknown to the wallet: try switching instead of adding.
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.idHex }],
    });
    return { ok: true, outcome: "switched", message: `${chain.name} added and selected in your wallet.` };
  } catch (error) {
    if (errorCode(error) === 4001) {
      return { ok: true, outcome: "added", message: `${chain.name} added. Network switch was declined.` };
    }
    return { ok: true, outcome: "added", message: `${chain.name} added to your wallet.` };
  }
}

/**
 * Ask the wallet to select an Electroneum network it already supports.
 *
 * Switch-first, the mirror image of `addEtnToWallet`: the user has explicitly
 * asked to move to a chain, so the switch is the operation that matters and the
 * additive call is only the repair path for unknown-chain error 4902. Some
 * wallets implement add-then-switch and others switch-only, which is why this
 * module carries both orders.
 */
export async function switchEtnChain(
  provider: Eip1193Provider | null = getEthereumProvider(),
  chainId: number = DEFAULT_ETN_CHAIN.id,
): Promise<WalletResult> {
  const chain = getEtnChain(chainId);
  if (!chain) {
    return { ok: false, outcome: "unsupported", message: `Chain ${chainId} is not an Electroneum network.` };
  }

  if (!provider) {
    return {
      ok: false,
      outcome: "no-provider",
      message: `No EVM wallet detected. Install MetaMask to use ${chain.name}.`,
    };
  }

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chain.idHex }],
    });
    return { ok: true, outcome: "switched", message: `Switched to ${chain.name}.` };
  } catch (error) {
    const code = errorCode(error);

    if (code === 4001) {
      return { ok: false, outcome: "rejected", message: "Network switch declined in your wallet." };
    }

    if (code === -32601 || code === -32602) {
      return {
        ok: false,
        outcome: "unsupported",
        message: `This wallet cannot switch networks programmatically. Add ${chain.name} manually.`,
      };
    }
    // Everything else - including 4902, the wallet not knowing the chain yet -
    // falls through to the additive path, which also performs the switch.
  }

  return addEtnToWallet(provider, chain.id);
}
