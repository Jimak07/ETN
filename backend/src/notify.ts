import type { RpcProbe } from "./types.js";

export type AlertLevel = "critical" | "warning" | "recovery";

export interface AlertEvent {
  rpcId: string;
  rpcName: string;
  level: AlertLevel;
  title: string;
  detail: string;
}

/** Discord embed accent colours, matching the dashboard status palette. */
const COLORS: Record<AlertLevel, number> = {
  critical: 0xfb7185,
  warning: 0xfbbf24,
  recovery: 0x34d399,
};

/**
 * Diffs the previous cycle against the current one and emits only transitions.
 *
 * Alerting on state rather than on every sample is what keeps the channel
 * usable: a node that is still offline does not page again every 5 seconds.
 */
export function detectTransitions(
  previous: ReadonlyMap<string, RpcProbe>,
  current: readonly RpcProbe[],
  driftThreshold: number,
): AlertEvent[] {
  const events: AlertEvent[] = [];

  for (const rpc of current) {
    const before = previous.get(rpc.id);
    const wasOffline = before?.status === "offline";
    const isOffline = rpc.status === "offline";

    if (isOffline && !wasOffline) {
      events.push({
        rpcId: rpc.id,
        rpcName: rpc.name,
        level: "critical",
        title: `${rpc.name} RPC is offline`,
        detail: rpc.error ?? "No response from the endpoint.",
      });
      continue;
    }

    if (wasOffline && !isOffline) {
      events.push({
        rpcId: rpc.id,
        rpcName: rpc.name,
        level: "recovery",
        title: `${rpc.name} RPC recovered`,
        detail: `Answering again in ${rpc.latencyMs ?? "?"} ms at block ${rpc.blockNumber ?? "?"}.`,
      });
      continue;
    }

    // Still offline: the transition was already reported.
    if (isOffline) continue;

    const drift = rpc.drift ?? 0;
    const wasDrifting = (before?.drift ?? 0) > driftThreshold;
    const isDrifting = drift > driftThreshold;

    if (isDrifting && !wasDrifting) {
      events.push({
        rpcId: rpc.id,
        rpcName: rpc.name,
        level: "warning",
        title: `${rpc.name} RPC is out of sync`,
        detail: `Drifting ${drift} blocks behind the network tip (threshold ${driftThreshold}).`,
      });
    } else if (wasDrifting && !isDrifting) {
      events.push({
        rpcId: rpc.id,
        rpcName: rpc.name,
        level: "recovery",
        title: `${rpc.name} RPC is back in sync`,
        detail: `Drift is down to ${drift} blocks.`,
      });
    }

    const isSlow = rpc.status === "degraded" && !isDrifting;
    const wasSlow =
      before?.status === "degraded" && before.drift !== null && before.drift <= driftThreshold;

    if (isSlow && !wasSlow) {
      events.push({
        rpcId: rpc.id,
        rpcName: rpc.name,
        level: "warning",
        title: `${rpc.name} RPC is slow`,
        detail: `Latency ${rpc.latencyMs ?? "?"} ms is above the healthy threshold.`,
      });
    } else if (wasSlow && !isSlow) {
      events.push({
        rpcId: rpc.id,
        rpcName: rpc.name,
        level: "recovery",
        title: `${rpc.name} RPC latency normalised`,
        detail: `Back to ${rpc.latencyMs ?? "?"} ms.`,
      });
    }
  }

  return events;
}

/**
 * Posts one embed per event. Best-effort: the caller logs and swallows
 * failures so a Discord outage can never interrupt monitoring.
 */
export async function sendDiscordAlerts(
  webhookUrl: string,
  events: readonly AlertEvent[],
  context: { highestNetworkBlock: number | null; cycle: number },
): Promise<void> {
  if (events.length === 0) return;

  const embeds = events.slice(0, 10).map((event) => ({
    title: event.title,
    description: event.detail,
    color: COLORS[event.level],
    footer: {
      text: `cycle #${context.cycle} · tip ${context.highestNetworkBlock ?? "unknown"}`,
    },
    timestamp: new Date().toISOString(),
  }));

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "ETN Pulse", embeds }),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook responded with ${response.status}`);
  }
}
