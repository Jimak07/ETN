import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Translucent surface with hairline border + backdrop blur. */
export function GlassCard({ className, children, ...props }: GlassCardProps) {
  return (
    <div className={cn("glass-panel shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

interface SectionHeadingProps {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionHeading({ title, subtitle, icon, action, className }: SectionHeadingProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/60 text-cyan-300 ring-1 ring-inset ring-slate-700/60">
            {icon}
          </span>
        ) : null}
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
