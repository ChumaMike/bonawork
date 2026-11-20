"use client";

import { useSyncExternalStore } from "react";
import type { IssueCategory, School } from "@/data/types";

/**
 * What a half-written report keeps on this phone, so a dropped connection or
 * a closed tab does not lose the typing. Files cannot be stored and are asked
 * for again.
 */
export interface StoredDraft {
  school: School | null;
  category: IssueCategory | "";
  title: string;
  location: string;
  description: string;
  anonymous: boolean;
  /** The screen the person was on. */
  screen: number;
}

const KEY = "bona:report-draft";

/** The draft found when the report screen opened; `undefined` until read. */
let initial: StoredDraft | null | undefined;
const listeners = new Set<() => void>();

function read(): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDraft;
    return stored.title || stored.description || stored.location || stored.category
      ? stored
      : null;
  } catch {
    return null;
  }
}

function getInitial(): StoredDraft | null {
  if (initial === undefined) initial = read();
  return initial;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The draft that was waiting when the screen opened. Null on the server and when there is none. */
export function useInitialDraft(): StoredDraft | null {
  return useSyncExternalStore(subscribe, getInitial, () => null);
}

/** Forget the opening draft so the next visit reads the store again. */
export function forgetInitialDraft() {
  initial = undefined;
}

export function saveDraft(draft: StoredDraft) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private mode or a full store: the form still works, it just forgets on reload.
  }
}

export function clearDraft() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
  initial = null;
  listeners.forEach((listener) => listener());
}
