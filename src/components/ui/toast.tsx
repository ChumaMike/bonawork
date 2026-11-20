"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useMessages } from "@/i18n";
import { cn } from "./cn";
import { Icon, type IconName } from "./icon";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type Toast = {
  id: number;
  title: string;
  body?: string;
  tone: ToastTone;
  action?: { label: string; onClick: () => void };
  /** Milliseconds before it leaves on its own. 0 keeps it until dismissed. */
  duration: number;
};

/*
 * A tiny store outside React so any code — a form handler, a fetch helper —
 * can announce something without threading props. <ToastRegion> in the root
 * layout renders the queue inside one polite live region.
 */
let queue: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: Toast[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function toast(input: {
  title: string;
  body?: string;
  tone?: ToastTone;
  action?: Toast["action"];
  duration?: number;
}): number {
  const id = nextId++;
  const item: Toast = {
    id,
    title: input.title,
    body: input.body,
    tone: input.tone ?? "info",
    action: input.action,
    // Anything with an action or a warning stays longer; people need time to read.
    duration:
      input.duration ?? (input.action || input.tone === "danger" ? 10_000 : 6_000),
  };
  queue = [...queue, item].slice(-3);
  emit();
  return id;
}

export function dismissToast(id: number) {
  if (!queue.some((item) => item.id === id)) return;
  queue = queue.filter((item) => item.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    subscribe,
    () => queue,
    () => EMPTY,
  );
}

const tones: Record<ToastTone, { icon: IconName; className: string }> = {
  info: { icon: "info", className: "border-st-assess text-ink" },
  success: { icon: "check", className: "border-st-verified text-ink" },
  warning: { icon: "alert", className: "border-accent text-ink" },
  danger: { icon: "alert", className: "border-danger text-ink" },
};

/** Rendered once, in the root layout. Sits above the phone bottom bar. */
export function ToastRegion() {
  const m = useMessages();
  const toasts = useToasts();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-relevant="additions"
      aria-label={m.common.notifications}
      className="no-print pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4 bottom-[calc(var(--spacing-bottom-bar)+env(safe-area-inset-bottom)+0.75rem)] lg:bottom-6 lg:items-end lg:px-6"
    >
      {toasts.map((item) => (
        <ToastCard key={item.id} toast={item} />
      ))}
    </div>
  );
}

function ToastCard({ toast: item }: { toast: Toast }) {
  const m = useMessages();
  const tone = tones[item.tone];

  useEffect(() => {
    if (item.duration === 0) return;
    const timer = setTimeout(() => dismissToast(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item.id, item.duration]);

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border-l-4 bg-surface p-3 pl-4 shadow-raised motion-safe:animate-[bona-rise_200ms_ease-out]",
        tone.className,
      )}
    >
      <Icon name={tone.icon} className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 py-0.5">
        <p className="font-semibold">{item.title}</p>
        {item.body ? <p className="text-sm text-muted">{item.body}</p> : null}
        {item.action ? (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              dismissToast(item.id);
            }}
            className="mt-1 inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4"
          >
            {item.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        aria-label={m.common.dismiss}
        className="-m-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
      >
        <Icon name="x" className="size-5" />
      </button>
    </div>
  );
}
