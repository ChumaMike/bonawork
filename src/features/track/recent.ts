"use client";

import { useSyncExternalStore } from "react";

/** A report this phone has followed or submitted. Nothing private: reference and title only. */
export interface RecentReference {
  reference: string;
  issueId: string;
  title: string;
  seenAt: string;
}

const KEY = "bona:recent-references";
const LIMIT = 5;
const EMPTY: RecentReference[] = [];

let cached: RecentReference[] | undefined;
const listeners = new Set<() => void>();

function read(): RecentReference[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RecentReference[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: RecentReference[]) {
  cached = list;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Private mode or a full store: the list lives for this page only.
  }
  listeners.forEach((listener) => listener());
}

function getSnapshot() {
  if (cached === undefined) cached = read();
  return cached;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The references remembered on this phone, newest first. Empty on the server. */
export function useRecentReferences(): RecentReference[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

export function rememberReference(entry: Omit<RecentReference, "seenAt">) {
  const rest = getSnapshot().filter((item) => item.reference !== entry.reference);
  write([{ ...entry, seenAt: new Date().toISOString() }, ...rest].slice(0, LIMIT));
}

export function forgetReference(reference: string) {
  write(getSnapshot().filter((item) => item.reference !== reference));
}
