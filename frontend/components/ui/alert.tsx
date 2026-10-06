import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const alertVariants = cva(
  "relative w-full rounded-xl border p-3 text-xs leading-relaxed transition duration-200 [&>svg]:absolute [&>svg]:left-3 [&>svg]:top-3 [&>svg]:text-current [&>svg~*]:pl-6",
  {
    variants: {
      variant: {
        default:
          "border-slate-800 bg-slate-900/60 text-slate-200 [&>svg]:text-cyan-400",
        destructive:
          "border-rose-500/40 bg-rose-950/30 text-rose-200 [&>svg]:text-rose-400",
        warning:
          "border-amber-500/40 bg-amber-950/30 text-amber-200 [&>svg]:text-amber-400",
        cyan:
          "border-cyan-500/40 bg-cyan-950/30 text-cyan-200 [&>svg]:text-cyan-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-0.5 font-medium leading-none tracking-tight text-slate-100", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-[0.68rem] leading-relaxed opacity-90", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
