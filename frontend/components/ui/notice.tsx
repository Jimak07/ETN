import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type NoticeTone = "rose" | "amber" | "slate";

const TONES: Record<NoticeTone, { box: string; title: string; icon: string }> = {
  rose: {
    box: "border-status-offline/30 bg-status-offline/[0.07]",
    title: "text-status-offline",
    icon: "text-status-offline",
  },
  amber: {
    box: "border-status-degraded/30 bg-status-degraded/[0.07]",
    title: "text-status-degraded",
    icon: "text-status-degraded",
  },
  slate: {
    box: "border-slate-800 bg-slate-950/40",
    title: "text-slate-300",
    icon: "text-slate-500",
  },
};

interface NoticeProps {
  tone?: NoticeTone;
  icon?: ReactNode;
  title: string;
  detail?: ReactNode;
  className?: string;
}

/**
 * Inline status panel for a card that has nothing to plot: a failed read, a
 * deployment without history, or a window that holds no samples yet.
 */
export function Notice({ tone = "slate", icon, title, detail, className }: NoticeProps) {
  const styles = TONES[tone];

  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-xl border px-3.5 py-3 backdrop-blur-md",
        styles.box,
        className,
      )}
    >
      {icon ? <span className={cn("mt-0.5 shrink-0", styles.icon)}>{icon}</span> : null}
      <div className="min-w-0 space-y-1">
        <p className={cn("text-xs font-medium", styles.title)}>{title}</p>
        {detail ? (
          <p className="text-[0.7rem] leading-relaxed text-slate-400/90">{detail}</p>
        ) : null}
      </div>
    </div>
  );
}
