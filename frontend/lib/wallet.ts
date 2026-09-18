import {
  ETN_CHAIN_ID,
  ETN_CHAIN_ID_HEX,
  ETN_CHAIN_NAME,
  ETN_EXPLORER_URL,
  ETN_NATIVE_CURRENCY,
  MONITORED_RPCS,
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

/** EIP-3085 payload used by `wallet_addEthereumChain`. */
export const ETN_WALLET_CHAIN_PARAMS = {
  chainId: ETN_CHAIN_ID_HEX,
  chainName: ETN_CHAIN_NAME,
  nativeCurrency: ETN_NATIVE_CURRENCY,
  rpcUrls: MONITORED_RPCS.map((rpc) => rpc.url),
  blockExplorerUrls: [ETN_EXPLORER_URL],
} as const;

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
 * Request that the injected wallet add + select the Electroneum Smart Chain.
 *
 * Wallets implement this inconsistently, so we try the additive call first and
 * fall back to a switch (and vice versa for error 4902 / unknown chain).
 */
export async function addEtnToWallet(
  provider: Eip1193Provider | null = getEthereumProvider(),
): Promise<WalletResult> {
  if (!provider) {
    return {
      ok: false,
      outcome: "no-provider",
      message: `No EVM wallet detected. Install MetaMask to add ${ETN_CHAIN_NAME} (chain ${ETN_CHAIN_ID}).`,
    };
  }

  try {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [ETN_WALLET_CHAIN_PARAMS],
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
      params: [{ chainId: ETN_CHAIN_ID_HEX }],
    });
    return { ok: true, outcome: "switched", message: "ETN added and selected in your wallet." };
  } catch (error) {
    if (errorCode(error) === 4001) {
      return { ok: true, outcome: "added", message: "ETN added. Network switch was declined." };
    }
    return { ok: true, outcome: "added", message: "ETN added to your wallet." };
  }
}
