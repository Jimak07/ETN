"use client";

import { Blocks, Fuel, Gauge } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { useAnimatedNumber } from "@/hooks/use-animated-number";
import { cn } from "@/lib/cn";
import {
  formatBlockAge,
  formatCount,
  formatGasPrice,
  formatLatency,
  parseDecimalString,
  statusLabel,
} from "@/lib/format";
import type { PulseHistoryPoint, PulseSnapshot, RpcProbe } from "@/lib/types";

import { GlassCard } from "./ui/glass-card";
import { Skeleton } from "./ui/skeleton";

type Accent = "cyan" | "emerald" | "amber" | "rose";

const ACCENTS: Record<Accent, { chip: string; value: string }> = {
  cyan: { chip: "bg-cyan-500/10 text-cyan-300 ring-cyan-500/20", value: "text-slate-50" },
  emerald: {
    chip: "bg-status-healthy/10 text-status-healthy ring-status-healthy/20",
    value: "text-status-healthy",
  },
  amber: {
    chip: "bg-status-degraded/10 text-status-degraded ring-status-degraded/20",
    value: "text-status-degraded",
  },
  rose: {
    chip: "bg-status-offline/10 text-status-offline ring-status-offline/20",
    value: "text-status-offline",
  },
};

/** Derive seconds-per-block from the rolling history window. */
function estimateBlockTimeSeconds(history: PulseHistoryPoint[]): number | null {
  for (let index = history.length - 1; index > 0; index -= 1) {
    const newer = history[index];
    const older = history[index - 1];
    if (!newer || !older) continue;
    if (typeof newer.highestNetworkBlock !== "number" || typeof older.highestNetworkBlock !== "number") continue;

    const blockDelta = newer.highestNetworkBlock - older.highestNetworkBlock;
    const secondsDelta = (newer.t - older.t) / 1000;
    if (blockDelta > 0 && secondsDelta > 0.5) return secondsDelta / blockDelta;
  }
  return null;
}

function pickFastest(snapshot: PulseSnapshot | null): RpcProbe | null {
  if (!snapshot) return null;
  return snapshot.rpcs.find((rpc) => rpc.id === snapshot.fastestRpcId) ?? null;
}

function latencyAccent(rpc: RpcProbe | null): Accent {
  if (!rpc || rpc.status === "offline") return "rose";
  return rpc.status === "healthy" ? "emerald" : "amber";
}

interface KpiCardProps {
  label: string;
  icon: ReactNode;
  accent: Accent;
  value: string;
  unit?: string;
  hint: string;
  loading: boolean;
}

function KpiCard({ label, icon, accent, value, unit, hint, loading }: KpiCardProps) {
  const styles = ACCENTS[accent];

  return (
    <GlassCard className="p-5 transition duration-300 ease-out-expo hover:border-slate-700">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-3">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>

          {loading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <p className={cn("num kpi-value font-mono tabular-nums", styles.value)}>
              {value}
              {unit ? (
                <span className="ml-1.5 text-sm font-normal text-slate-500">{unit}</span>
              ) : null}
            </p>
          )}

          {loading ? (
            <Skeleton className="h-3 w-28" />
          ) : (
            <p className="num truncate text-xs text-slate-500">{hint}</p>
          )}
        </div>

        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
            styles.chip,
          )}
        >
          {icon}
        </span>
      </div>
    </GlassCard>
  );
}

interface KpiCardsProps {
  snapshot: PulseSnapshot | null;
  history: PulseHistoryPoint[];
  loading: boolean;
}

export function KpiCards({ snapshot, history, loading }: KpiCardsProps) {
  const fastest = useMemo(() => pickFastest(snapshot), [snapshot]);
  const blockTime = useMemo(() => estimateBlockTimeSeconds(history), [history]);

  const gasPriceGwei = useMemo(
    () => parseDecimalString(snapshot?.gasPriceGwei),
    [snapshot?.gasPriceGwei],
  );
  const baseFeeGwei = useMemo(() => parseDecimalString(snapshot?.baseFeeGwei), [snapshot?.baseFeeGwei]);

  const animatedBlock = useAnimatedNumber(snapshot?.highestNetworkBlock ?? null);
  const animatedGas = useAnimatedNumber(gasPriceGwei);
  const animatedLatency = useAnimatedNumber(fastest?.latencyMs ?? null);

  const blockHint = [
    blockTime ? `~${blockTime.toFixed(1)}s block time` : "sync window warming up",
    formatBlockAge(snapshot?.blockTimestamp ?? null),
  ].join(" · ");

  const gasHint =
    baseFeeGwei !== null
      ? `base fee ${formatGasPrice(baseFeeGwei)} Gwei`
      : "legacy gas pricing detected";

  const latencyHint = fastest
    ? `${fastest.name} · ${statusLabel(fastest.status)}`
    : "all endpoints unreachable";

  return (
    <section aria-label="Network key metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        label="Latest Block"
        icon={<Blocks className="h-4 w-4" />}
        accent="cyan"
        value={animatedBlock === null ? "—" : formatCount(animatedBlock)}
        hint={blockHint}
        loading={loading}
      />
      <KpiCard
        label="Current Gas Fee"
        icon={<Fuel className="h-4 w-4" />}
        accent="cyan"
        value={animatedGas === null ? "—" : formatGasPrice(animatedGas)}
        unit="Gwei"
        hint={gasHint}
        loading={loading}
      />
      <KpiCard
        label="Fastest RPC Latency"
        icon={<Gauge className="h-4 w-4" />}
        accent={latencyAccent(fastest)}
        value={animatedLatency === null ? "—" : formatLatency(animatedLatency)}
        unit="ms"
        hint={latencyHint}
        loading={loading}
      />
    </section>
  );
}
