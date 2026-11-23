"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** A small number after the label, e.g. how many photos. */
  count?: number;
}

/**
 * A row of tabs that splits one long page into a few named parts: pills on a
 * soft track, as on the landing page, the chosen one white. Large targets,
 * arrow keys move between tabs. Pair each tab with a <TabPanel> that has the
 * same `id`.
 */
export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  idPrefix,
  className,
}: {
  /** Names the group for screen readers, e.g. "Parts of this report". */
  label: string;
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Makes ids unique when a page has more than one set of tabs. */
  idPrefix: string;
  className?: string;
}) {
  const list = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent) {
    const index = tabs.findIndex((tab) => tab.id === value);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next].id);
    list.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  }

  return (
    <div
      ref={list}
      role="tablist"
      aria-label={label}
      className={cn("flex gap-1 rounded-full bg-sunken p-1", className)}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={onKeyDown}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-1.5 text-[0.95rem] font-medium whitespace-nowrap transition-colors",
              selected
                ? "bg-surface text-ink shadow-[0_1px_2px_rgb(4_4_9/0.1),0_0_0_1px_var(--color-line)]"
                : "text-muted hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs text-muted",
                  selected ? "bg-sunken" : "bg-surface",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** The content for one tab. Hidden, not removed, when another tab is chosen. */
export function TabPanel({
  id,
  idPrefix,
  active,
  className,
  children,
}: {
  id: string;
  idPrefix: string;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      hidden={!active}
      tabIndex={0}
      className={cn("pt-6 focus-visible:outline-offset-4", className)}
    >
      {children}
    </div>
  );
}
