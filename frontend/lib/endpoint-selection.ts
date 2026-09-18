import type { SelectedEndpoint } from "./etn";
import type { RpcProbe, RpcStatus } from "./types";

/**
 * The latency/status a KPI card should mirror for the current selection.
 *
 * Keeping this in one place means the "Fastest RPC Latency" card, the
 * leaderboard highlight and the sparkline can never disagree about which
 * endpoint is being displayed.
 */
export interface EndpointReading {
  /** Node the reading came from, or null when nothing is available yet. */
  rpc: RpcProbe | null;
  latencyMs: number | null;
  status: RpcStatus | null;
  /** True when the value is the minimum across every online node. */
  aggregated: boolean;
  /** How many nodes contributed to an aggregated reading. */
  onlineCount: number;
}

const NO_READING: EndpointReading = {
  rpc: null,
  latencyMs: null,
  status: null,
  aggregated: false,
  onlineCount: 0,
};

/**
 * Binds a selection to real probe data.
 *
 * A pinned endpoint reports *its own* latency and status — including `null` and
 * "offline" when it is down — so the card never quietly falls back to a healthy
 * node while the user believes they are watching the pinned one. "fastest"
 * reports `Math.min(...)` across the nodes that answered.
 */
export function resolveEndpointReading(
  rpcs: readonly RpcProbe[],
  selected: SelectedEndpoint,
): EndpointReading {
  if (selected !== "fastest") {
    const rpc = rpcs.find((candidate) => candidate.id === selected) ?? null;
    if (!rpc) return NO_READING;

    return {
      rpc,
      latencyMs: rpc.latencyMs,
      status: rpc.status,
      aggregated: false,
      onlineCount: 1,
    };
  }

  const online = rpcs.filter((rpc) => rpc.status !== "offline" && rpc.latencyMs !== null);
  if (online.length === 0) return NO_READING;

  const best = Math.min(...online.map((rpc) => rpc.latencyMs as number));
  const fastest = online.find((rpc) => rpc.latencyMs === best) ?? online[0];

  return {
    rpc: fastest,
    latencyMs: best,
    status: fastest.status,
    aggregated: true,
    onlineCount: online.length,
  };
}

/** Whether two selections point at the same endpoint for the given probes. */
export function selectionMatches(
  selected: SelectedEndpoint,
  rpcId: string,
  rpcs: readonly RpcProbe[],
): boolean {
  if (selected === "fastest") {
    return resolveEndpointReading(rpcs, "fastest").rpc?.id === rpcId;
  }
  return selected === rpcId;
}
