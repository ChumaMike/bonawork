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

/** The way back, at the top of a one-report screen's navy band. */
export function BackButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="vl-pagehero-back no-print">
      <Icon name="arrowLeft" className="size-4" />
      {children}
    </button>
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
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1.5 rounded-xl bg-sunken px-4 py-3">{children}</p>
    </div>
  );
}
