import { createPublicClient, defineChain, http, type PublicClient } from "viem";

import {
  ETN_CHAIN_ID,
  ETN_EXPLORER_API_URL,
  ETN_EXPLORER_URL,
  ETN_NATIVE_CURRENCY,
  MONITORED_RPCS,
  RPC_REQUEST_TIMEOUT_MS,
  type MonitoredRpc,
} from "./etn";

/** viem chain definition for the Electroneum Smart Chain mainnet. */
export const electroneum = defineChain({
  id: ETN_CHAIN_ID,
  name: "Electroneum",
  nativeCurrency: ETN_NATIVE_CURRENCY,
  rpcUrls: {
    default: {
      http: MONITORED_RPCS.map((rpc) => rpc.url),
    },
  },
  blockExplorers: {
    default: {
      name: "Electroneum Block Explorer",
      url: ETN_EXPLORER_URL,
      apiUrl: ETN_EXPLORER_API_URL,
    },
  },
  testnet: false,
});

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
