import * as React from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-xl border bg-slate-950/80 px-3 py-2 text-xs text-slate-100 ring-offset-background file:border-0 file:bg-transparent file:text-xs file:font-medium placeholder:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition duration-200",
          error
            ? "border-rose-500/60 text-rose-200 focus-visible:border-rose-500 focus-visible:ring-rose-500/20"
            : "border-slate-800 focus-visible:border-cyan-500/60 focus-visible:ring-cyan-500/20",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
