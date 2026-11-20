import Link from "next/link";
import type { ReactNode } from "react";
import { useMessages } from "@/i18n";
import { Button } from "./button";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

/** Page width. `narrow` for forms and reading, `wide` for lists and dashboards. */
export function Container({
  size = "wide",
  className,
  children,
}: {
  size?: "narrow" | "wide";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 sm:py-10",
        size === "narrow" ? "max-w-2xl" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  intro,
  back,
  children,
}: {
  title: string;
  intro?: string;
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {back ? (
        <Link
          href={back.href}
          className="no-print mb-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-strong underline-offset-4 hover:underline"
        >
          <Icon name="arrowLeft" className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {intro ? <p className="mt-2 max-w-2xl text-lg text-muted">{intro}</p> : null}
      {children}
    </header>
  );
}

export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-xl font-bold tracking-tight">
      {children}
    </h2>
  );
}

const noticeTones = {
  info: "border-st-assess bg-st-assess-soft",
  warning: "border-accent bg-accent-soft",
  success: "border-st-verified bg-st-verified-soft",
  danger: "border-danger bg-danger-soft",
} as const;

export function Notice({
  tone = "info",
  icon = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof noticeTones;
  icon?: IconName;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-3 rounded-xl border p-4", noticeTones[tone], className)}>
      <Icon name={icon} className="mt-0.5 size-5" />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? (
          <div className={cn(title && "mt-1", "text-[0.95rem]")}>{children}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Placeholder shown while data loads. Announced once to screen readers. */
export function Loading({ lines = 3 }: { lines?: number }) {
  const m = useMessages();
  return (
    <div role="status" className="flex flex-col gap-3">
      <span className="sr-only">{m.common.loading}</span>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-2xl border border-line bg-surface"
        />
      ))}
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const m = useMessages();
  return (
    <Notice tone="danger" icon="alert" title={m.common.loadError}>
      <Button variant="secondary" onClick={onRetry} className="mt-2">
        {m.common.retry}
      </Button>
    </Notice>
  );
}

/**
 * One-sentence "nothing here" note. For a title, picture and action use
 * `EmptyState` from ./empty-state instead.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-line-strong bg-sun-soft/60 p-6 text-center text-muted">
      {children}
    </p>
  );
}

export function NotFound({ children }: { children?: ReactNode }) {
  const m = useMessages();
  return (
    <Container size="narrow">
      <PageHeader title={m.common.notFoundTitle} intro={m.common.notFoundBody} />
      {children}
    </Container>
  );
}
