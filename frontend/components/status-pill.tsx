import { cn } from "@/lib/cn";
import { statusLabel } from "@/lib/format";
import type { RpcStatus } from "@/lib/types";

export const STATUS_STYLES: Record<RpcStatus, { dot: string; pill: string; text: string }> = {
  healthy: {
    dot: "bg-status-healthy",
    pill: "bg-status-healthy/10 ring-status-healthy/25",
    text: "text-status-healthy",
  },
  degraded: {
    dot: "bg-status-degraded",
    pill: "bg-status-degraded/10 ring-status-degraded/25",
    text: "text-status-degraded",
  },
  offline: {
    dot: "bg-status-offline",
    pill: "bg-status-offline/10 ring-status-offline/25",
    text: "text-status-offline",
  },
};

export function StatusDot({ status, className }: { status: RpcStatus; className?: string }) {
  return (
    <span className={cn("relative flex h-2 w-2", className)}>
      {status !== "offline" ? (
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            STATUS_STYLES[status].dot,
          )}
        />
      ) : null}
      <span
        className={cn("relative inline-flex h-2 w-2 rounded-full", STATUS_STYLES[status].dot)}
      />
    </span>
  );
}

export function StatusPill({ status, className }: { status: RpcStatus; className?: string }) {
  const styles = STATUS_STYLES[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[0.68rem] font-medium uppercase tracking-[0.12em] ring-1 ring-inset",
        styles.pill,
        styles.text,
        className,
      )}
    >
      <StatusDot status={status} />
      {statusLabel(status)}
    </span>
  );
}
