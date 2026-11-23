import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useMessages } from "@/i18n";
import { cn } from "./cn";
import { Icon } from "./icon";

const variants = {
  primary:
    "bg-brand text-on-brand hover:bg-brand-strong hover:shadow-[0_10px_24px_-10px_rgb(3_70_255/0.7)]",
  secondary: "border border-line-strong bg-surface text-ink hover:border-ink",
  quiet: "text-brand-strong hover:bg-brand-soft",
  danger: "bg-danger text-on-brand hover:bg-danger-strong",
  /** @deprecated use `quiet` */
  ghost: "text-brand-strong hover:bg-brand-soft",
} as const;

export type ButtonVariant = keyof typeof variants;

/** 44 px is the floor; the default is 48 px, comfortable for thumbs and less steady hands. */
const sizes = {
  sm: "min-h-11 px-4 text-sm",
  md: "min-h-12 px-5 text-base",
  lg: "min-h-14 px-6 text-lg",
} as const;

export type ButtonSize = keyof typeof sizes;

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background-color,border-color,color,box-shadow] select-none disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none aria-busy:cursor-progress";

type Shared = {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ComponentProps<"button"> & Shared & { loading?: boolean }) {
  const m = useMessages();
  return (
    <button
      type={type}
      className={cn(base, sizes[size], variants[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Icon name="loader" className="size-5 animate-spin" />
          <span className="sr-only">{m.common.processing}</span>
        </>
      ) : null}
      {children}
    </button>
  );
}

/** Link styled as a button. */
export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & Shared) {
  return (
    <Link className={cn(base, sizes[size], variants[variant], className)} {...props} />
  );
}

/** A square icon-only button. `label` is required: the icon alone says nothing to a screen reader. */
export function IconButton({
  label,
  icon,
  variant = "quiet",
  className,
  type = "button",
  ...props
}: Omit<ComponentProps<"button">, "children"> & {
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
