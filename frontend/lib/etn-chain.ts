import { createPublicClient, defineChain, http, type Chain, type PublicClient } from "viem";

import {
  ETN_MAINNET,
  ETN_TESTNET,
  RPC_REQUEST_TIMEOUT_MS,
  type EtnChainConfig,
  type MonitoredRpc,
} from "./etn";

/**
 * Projects a flat `EtnChainConfig` into the shape viem wants.
 *
 * One function rather than two hand-written `defineChain` blocks: the testnet
 * definition is the only chance to get a chain id or an explorer wrong in a way
 * that silently points a user at the wrong network, and deriving both from the
 * same record removes that class of mistake.
 */
function defineEtnChain(config: EtnChainConfig): Chain {
  return defineChain({
    id: config.id,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: {
      default: { http: [...config.rpcUrls] },
    },
    blockExplorers: {
      default: {
        name: `${config.name} Block Explorer`,
        url: config.explorerUrl,
        apiUrl: config.explorerApiUrl,
      },
    },
    testnet: config.testnet,
  });
}

/** viem chain definition for the Electroneum Smart Chain mainnet. */
export const electroneum = defineEtnChain(ETN_MAINNET);

/** viem chain definition for the Electroneum Smart Chain testnet. */
export const electroneumTestnet = defineEtnChain(ETN_TESTNET);

/** viem chains keyed by EIP-155 id, for the write path's runtime lookup. */
const VIEM_CHAINS: Record<number, Chain> = {
  [ETN_MAINNET.id]: electroneum,
  [ETN_TESTNET.id]: electroneumTestnet,
};

/** viem chain for an id, or null when the wallet is on an unsupported network. */
export function getViemChain(chainId: number | null | undefined): Chain | null {
  if (typeof chainId !== "number") return null;
  return VIEM_CHAINS[chainId] ?? null;
}

/** viem chain for display, defaulting to mainnet. */
export function getViemChainOrDefault(chainId: number | null | undefined): Chain {
  return getViemChain(chainId) ?? electroneum;
}

const clientCache = new Map<string, PublicClient>();

/**
 * Memoised viem client per RPC URL. Reusing clients keeps the connection pool
 * warm between pulses, which matters because the dashboard polls every 5s.
 */
export function getRpcClient(
  rpc: MonitoredRpc,
  timeoutMs: number = RPC_REQUEST_TIMEOUT_MS,
): PublicClient {
  const cacheKey = `${rpc.id}:${rpc.url}:${timeoutMs}`;
  const cached = clientCache.get(cacheKey);
  if (cached) return cached;

  const client = createPublicClient({
    chain: electroneum,
    transport: http(rpc.url, {
      timeout: timeoutMs,
      retryCount: 0,
    }),
  });

  clientCache.set(cacheKey, client);
  return client;
}
