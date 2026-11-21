"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icon";
import { useMessages } from "@/i18n";

/**
 * A side note in Bolt's bubble: which of South Africa's official languages
 * does this person prefer? Pressing it opens a dropdown of all twelve.
 *
 * It only remembers the answer, on this device. Nothing else reads it: the
 * interface does not change language and Bona AI is not told.
 */
export const LANGUAGE_KEY = "bona:buddy:language";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function saved(): string | null {
  try {
    return window.localStorage.getItem(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

function save(code: string) {
  try {
    window.localStorage.setItem(LANGUAGE_KEY, code);
  } catch {
    /* private window or blocked storage: it just will not be remembered */
  }
  for (const listener of [...listeners]) listener();
}

export function LanguagePreference() {
  const t = useMessages().buddy.language;
  // Null on the server and while hydrating, so the saved answer cannot upset hydration.
  const code = useSyncExternalStore(subscribe, saved, () => null);
  const chosen = t.options.find((option) => option.code === code);
  const [picking, setPicking] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const noteId = useId();
  const listId = useId();

  /** One press shows the list: focus the dropdown as it appears and open it where the browser can. */
  const openList = useCallback((node: HTMLSelectElement | null) => {
    if (!node) return;
    node.focus();
    try {
      node.showPicker?.();
    } catch {
      /* not allowed here: the focused dropdown opens with a press, Space or the arrow keys */
    }
  }, []);

  return (
    <div
      data-testid="buddy-language"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-1 text-xs text-muted"
    >
      {chosen ? (
        <span id={noteId}>
          {t.chosen}{" "}
          <strong className="font-semibold text-ink" lang={chosen.lang}>
            {chosen.name}
          </strong>
        </span>
      ) : null}
      <button
        ref={trigger}
        type="button"
        id={chosen ? undefined : noteId}
        aria-describedby={chosen ? noteId : undefined}
        aria-expanded={picking}
        aria-controls={picking ? listId : undefined}
        onClick={() => setPicking((on) => !on)}
        className="inline-flex min-h-8 items-center gap-1 rounded-full text-left font-semibold text-ink underline decoration-line-strong underline-offset-2 hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {chosen ? t.change : t.question}
        <Icon
          name={picking ? "chevronUp" : "chevronDown"}
          className="size-3.5 shrink-0"
        />
      </button>
      {picking ? (
        <select
          ref={openList}
          id={listId}
          aria-labelledby={noteId}
          value={chosen?.code ?? ""}
          onChange={(event) => {
            save(event.target.value);
            setPicking(false);
            trigger.current?.focus();
          }}
          className="h-9 min-w-0 flex-1 basis-44 rounded-full border border-line-strong bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {chosen ? null : (
            <option value="" disabled hidden>
              {t.choose}
            </option>
          )}
          {t.options.map((option) => (
            <option key={option.code} value={option.code} lang={option.lang}>
              {option.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
