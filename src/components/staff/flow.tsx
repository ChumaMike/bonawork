"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * Put the open report in the address bar without loading a page. Next.js
 * keeps `useSearchParams` in step with `pushState`, so the screen follows
 * the address and the phone's Back button returns to the list.
 */
export function showInUrl(params: Record<string, string> | null) {
  const search = params ? `?${new URLSearchParams(params).toString()}` : "";
  window.history.pushState(null, "", `${window.location.pathname}${search}`);
}

/** The way back, top left of a one-report screen. */
export function BackButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="no-print -ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-left font-semibold text-brand-strong underline-offset-4 hover:underline"
    >
      <Icon name="arrowLeft" className="size-4" />
      {children}
    </button>
  );
}

/** A new screen starts at its top, with the title read out first. */
function takeFocus(element: HTMLElement | null) {
  if (!element) return;
  element.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/**
 * The title of a one-report screen. It takes focus when the screen opens, so
 * a screen reader announces the report instead of staying on the list row
 * that was tapped.
 */
export function FlowTitle({ children }: { children: ReactNode }) {
  return (
    <h1 ref={takeFocus} tabIndex={-1} className="text-2xl tracking-tight sm:text-3xl">
      {children}
    </h1>
  );
}

/** A ref for something that should take focus as soon as it appears. Give it `tabIndex={-1}`. */
export function focusHere(element: HTMLElement | null) {
  element?.focus();
}

/**
 * The heading of a step that replaces what was on the screen (a form, a
 * result). It takes focus and scrolls into view, so the change is announced
 * and seen without opening the phone's keyboard.
 */
export function StepHeading({
  id,
  children,
  className = "text-xl",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2 id={id} ref={focusHere} tabIndex={-1} className={className}>
      {children}
    </h2>
  );
}

/** Someone else's words, set apart from ours: a label, then the quote. */
export function Quote({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-sm font-semibold text-muted">{label}</p>
      <p className="mt-1 border-l-4 border-line-strong pl-3">{children}</p>
    </div>
  );
}
