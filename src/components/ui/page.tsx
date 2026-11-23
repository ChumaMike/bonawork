import Link from "next/link";
import type { ComponentProps, ReactNode, Ref } from "react";
import { Photo } from "@/components/media/photo";
import type { PhotoName } from "@/components/media/manifest";
import { useMessages } from "@/i18n";
import { Button } from "./button";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";
/* The band is drawn with the landing page's own classes; the shell adds the rest. */
import "@/features/landing/vellure/vellure.css";
import "./page-shell.css";

/**
 * The one content width of every page: 1120 px. `narrow` centres a 720 px
 * column inside it, for a form or a page that is read top to bottom.
 */
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
    <div className="page-wrap py-8 sm:py-12">
      <div className={cn(size === "narrow" && "page-narrow", className)}>{children}</div>
    </div>
  );
}

/** A new screen starts at its top, with the title read out first. */
function takeFocus(element: HTMLElement | null) {
  if (!element) return;
  element.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

type BackLink = { href: string; label: string; ariaLabel?: string };

export type PageHeroProps = {
  /** The small pill above the title: what kind of page this is. */
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  /** The way back, above the label: a link, or a button of the page's own. */
  back?: BackLink | ReactNode;
  /** A line of facts under the title: a place, a reference, a status pill. */
  meta?: ReactNode;
  /** A photograph behind the band, under a navy wash. Decorative. */
  photo?: PhotoName;
  /** Shorter, for a screen that is one step of a task. */
  size?: "default" | "compact";
  /** Move focus to the title when the screen opens, so a screen reader announces it. */
  focusTitle?: boolean;
  /** For a page that moves focus to its title itself, as a flow does between steps. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** The page's main control (a search box, a reference field), inside the band. */
  children?: ReactNode;
  testId?: string;
};

function isBackLink(back: PageHeroProps["back"]): back is BackLink {
  return typeof back === "object" && back !== null && "href" in back;
}

/**
 * The navy band at the top of every page under the landing page, in the
 * landing page's style and shorter: the label, the page's one h1, a sentence,
 * and the page's main control where it has one. The top bar lies over it.
 */
export function PageHero({
  eyebrow,
  title,
  intro,
  back,
  meta,
  photo,
  size = "default",
  focusTitle = false,
  titleRef,
  children,
  testId,
}: PageHeroProps) {
  return (
    <section
      className="vl vl-pagehero vl-on-dark"
      data-size={size}
      data-testid={testId ?? (photo ? "photo-header" : "page-hero")}
    >
      {photo ? (
        <div className="vl-pagehero-photo" aria-hidden="true">
          <Photo name={photo} alt="" priority sizes="100vw" shape="free" />
        </div>
      ) : null}
      <div className="page-wrap">
        <div className="vl-pagehero-top">
          {isBackLink(back) ? (
            <Link
              href={back.href}
              aria-label={back.ariaLabel}
              className="vl-pagehero-back no-print"
            >
              <Icon name="arrowLeft" className="size-4" />
              {back.label}
            </Link>
          ) : (
            (back ?? null)
          )}
          {eyebrow ? <p className="vl-badge">{eyebrow}</p> : null}
        </div>
        <h1
          ref={titleRef ?? (focusTitle ? takeFocus : undefined)}
          tabIndex={titleRef || focusTitle ? -1 : undefined}
        >
          {title}
        </h1>
        {intro ? <p className="vl-hero-sub">{intro}</p> : null}
        {meta ? <div className="vl-pagehero-meta">{meta}</div> : null}
        {children ? <div className="vl-pagehero-control">{children}</div> : null}
      </div>
    </section>
  );
}

/**
 * A whole page: the band, then the content at the one page width.
 *
 *   <PageShell eyebrow="Schools" title="Find a school" intro="…" hero={<SearchBox />}>
 *     …cards…
 *   </PageShell>
 */
export function PageShell({
  hero,
  width = "wide",
  className,
  children,
  ...band
}: Omit<PageHeroProps, "children"> & {
  /** The page's main control, drawn inside the band. */
  hero?: ReactNode;
  width?: "narrow" | "wide";
  /** Classes for the content column. */
  className?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <PageHero {...band}>{hero}</PageHero>
      <Container size={width} className={className}>
        {children}
      </Container>
    </>
  );
}

/** The search pill of the landing page's hero, for a page's own band. */
export function HeroSearch({
  id,
  label,
  labelHidden = false,
  children,
  className,
  ...form
}: Omit<ComponentProps<"form">, "children"> & {
  /** The id of the input inside. */
  id: string;
  label: string;
  /** The title above already asks the question: keep the label for screen readers only. */
  labelHidden?: boolean;
  /** The input, and a button when the search is sent rather than live. */
  children: ReactNode;
}) {
  return (
    <form role="search" noValidate className={cn("vl-search", className)} {...form}>
      <label htmlFor={id} className={labelHidden ? "sr-only" : undefined}>
        {label}
      </label>
      <div className="vl-search-row">{children}</div>
    </form>
  );
}

export function SectionTitle({
  children,
  id,
  className,
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <h2 id={id} className={cn("text-2xl tracking-tight", className)}>
      {children}
    </h2>
  );
}

const noticeTones = {
  info: "bg-brand-soft text-brand-strong",
  warning: "bg-accent-soft text-accent",
  success: "bg-st-verified-soft text-st-verified",
  danger: "bg-danger-soft text-danger",
} as const;

/**
 * A message that is part of the page: a white card with the tone carried by
 * a small icon tile, so colour is never the only signal and no large area is
 * tinted.
 */
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
    <div
      data-tone={tone}
      className={cn(
        "flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          noticeTones[tone],
        )}
      >
        <Icon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1 self-center">
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
          className="h-24 animate-pulse rounded-2xl border border-line bg-surface shadow-card"
        />
      ))}
    </div>
  );
}

/** A whole page while it loads: the band at its usual height, then placeholders. */
export function PageLoading({
  lines = 3,
  width = "wide",
  size = "default",
  back,
}: {
  lines?: number;
  width?: "narrow" | "wide";
  size?: "default" | "compact";
  back?: ReactNode;
}) {
  return (
    <>
      <section
        className="vl vl-pagehero vl-on-dark"
        data-size={size}
        data-testid="page-hero"
      >
        <div className="page-wrap">
          {back ? <div className="vl-pagehero-top">{back}</div> : null}
          <div className="vl-pagehero-skeleton" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <Container size={width}>
        <Loading lines={lines} />
      </Container>
    </>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const m = useMessages();
  return (
    <Notice tone="danger" icon="alert" title={m.common.loadError}>
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-2">
        {m.common.retry}
      </Button>
    </Notice>
  );
}

/** A whole page that could not load. */
export function PageError({ onRetry, back }: { onRetry: () => void; back?: ReactNode }) {
  const m = useMessages();
  return (
    <PageShell title={m.common.loadErrorTitle} width="narrow" size="compact" back={back}>
      <LoadError onRetry={onRetry} />
    </PageShell>
  );
}

/**
 * One-sentence "nothing here" note. For a title, picture and action use
 * `EmptyState` from ./empty-state instead.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-sunken p-6 text-center text-muted">{children}</p>;
}

export function NotFound({ children }: { children?: ReactNode }) {
  const m = useMessages();
  return (
    <PageShell
      title={m.common.notFoundTitle}
      intro={m.common.notFoundBody}
      width="narrow"
      size="compact"
      className="flex justify-center"
    >
      {children}
    </PageShell>
  );
}
