import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-xs font-semibold ring-offset-background transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        default:
          "bg-cyan-400 text-slate-950 hover:bg-cyan-300 shadow-glow active:scale-[0.99]",
        glow:
          "bg-cyan-400 text-slate-950 hover:bg-cyan-300 shadow-glow active:scale-[0.99]",
        secondary:
          "border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-500/20 active:scale-[0.99]",
        outline:
          "border border-slate-800 bg-slate-900/60 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 active:scale-[0.99]",
        destructive:
          "border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:border-rose-500/60 hover:bg-rose-500/20 active:scale-[0.99]",
        ghost:
          "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
        link:
          "text-cyan-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 text-xs",
        sm: "h-7 rounded-lg px-2.5 text-[0.68rem]",
        lg: "h-11 rounded-xl px-6 text-sm font-semibold",
        icon: "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
