import type { RpcProbe } from "./types.js";

export interface DriftReport {
  rpcs: RpcProbe[];
  highestNetworkBlock: number | null;
  /** Ids of nodes whose drift exceeded the threshold. */
  outOfSyncRpcIds: string[];
}

/** Highest block seen across the nodes that answered. */
export function findHighestNetworkBlock(rpcs: readonly RpcProbe[]): number | null {
  const heights = rpcs
    .map((rpc) => rpc.blockNumber)
    .filter((height): height is number => typeof height === "number");

  return heights.length > 0 ? Math.max(...heights) : null;
}

/**
 * Synchronisation validation.
 *
 *   drift = highestNetworkBlock - rpc.blockNumber
 *
 * A node more than `driftThreshold` blocks behind is forcefully reported as
 * "degraded" with the warning "Out of sync by X blocks" — even when its latency
 * is well under the latency threshold. Nodes that never answered keep
 * `drift: null` so an offline endpoint is never mistaken for a lagging one.
 */
export function applyDriftDetection(
  rpcs: readonly RpcProbe[],
  highestNetworkBlock: number | null,
  driftThreshold: number,
): DriftReport {
  const outOfSyncRpcIds: string[] = [];

  const validated = rpcs.map((rpc) => {
    if (highestNetworkBlock === null || rpc.blockNumber === null) return rpc;

    const drift = Math.max(0, highestNetworkBlock - rpc.blockNumber);

    if (drift > driftThreshold) {
      outOfSyncRpcIds.push(rpc.id);
      return {
        ...rpc,
        drift,
        status: "degraded" as const,
        error: `Out of sync by ${drift} blocks`,
      };
    }

    return { ...rpc, drift };
  });

  return { rpcs: validated, highestNetworkBlock, outOfSyncRpcIds };
}
