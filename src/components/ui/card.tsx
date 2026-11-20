import type { ComponentProps } from "react";
import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

const tones = {
  brand: "bg-brand-soft text-brand-strong",
  accent: "bg-accent-soft text-accent",
  neutral: "bg-sunken text-muted",
} as const;

type BadgeProps = ComponentProps<"span"> & { tone?: keyof typeof tones };

export function Badge({ tone = "brand", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
