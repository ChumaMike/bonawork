import type { ReactNode } from "react";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

const tones = {
  info: { icon: "info", className: "border-st-assess bg-st-assess-soft" },
  success: { icon: "shieldCheck", className: "border-st-verified bg-st-verified-soft" },
  warning: { icon: "alert", className: "border-accent bg-accent-soft" },
  danger: { icon: "alert", className: "border-danger bg-danger-soft" },
} as const satisfies Record<string, { icon: IconName; className: string }>;

export type AlertTone = keyof typeof tones;

/**
 * A message that belongs to the page (unlike a toast, which passes). The
 * left border and icon carry the tone, so colour is never the only signal.
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
        "flex gap-3 rounded-xl border-l-4 bg-surface p-4 text-ink",
        style.className,
        className,
      )}
    >
      <Icon name={icon ?? style.icon} className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title && "mt-1", "text-sm")}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}
