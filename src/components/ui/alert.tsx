import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

const tones = {
  info: { icon: "info", className: "bg-brand-soft text-brand-strong" },
  success: { icon: "shieldCheck", className: "bg-st-verified-soft text-st-verified" },
  warning: { icon: "alert", className: "bg-accent-soft text-accent" },
  danger: { icon: "alert", className: "bg-danger-soft text-danger" },
} as const satisfies Record<string, { icon: IconName; className: string }>;

export type AlertTone = keyof typeof tones;

/**
 * A message that belongs to the page (unlike a toast, which passes): a white
 * card, with the tone carried by a small icon tile, so colour is never the
 * only signal.
 * `live` makes it an alert region: use it for an error that appears after an
 * action, not for text that is on the page from the start.
 */
export function Alert({
  tone = "info",
  icon,
  title,
  live = false,
  children,
  className,
}: {
  tone?: AlertTone;
  icon?: IconName;
  title?: string;
  live?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const style = tones[tone];
  return (
    <div
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
      className={cn(
        "flex gap-3 rounded-2xl border border-line bg-surface p-4 text-ink shadow-card",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          style.className,
        )}
      >
        <Icon name={icon ?? style.icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1 self-center">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title && "mt-1", "text-sm")}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
