"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getApi } from "./api";
import type { Session } from "./types";

/**
 * Who is signed in, shared by every component on the page.
 *
 * The session lives on the server (an HttpOnly cookie); this store only holds
 * what `GET /api/auth/session` returned, so the header, the dashboards and
 * the sign-in screen all agree and update together.
 */
export type SessionState =
  { status: "loading"; session: null } | { status: "ready"; session: Session | null };

let state: SessionState = { status: "loading", session: null };
let requested = false;
const listeners = new Set<() => void>();
const LOADING: SessionState = { status: "loading", session: null };

function set(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function refresh() {
  try {
    set({ status: "ready", session: await getApi().getSession() });
  } catch {
    // If the session cannot be read, behave as signed out rather than block the page.
    set({ status: "ready", session: null });
  }
}

export function useSession(): SessionState {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );
  useEffect(() => {
    if (!requested) {
      requested = true;
      void refresh();
    }
  }, []);
  return current;
}

/** Rejects with `ApiError` (`unauthenticated`) when the details are wrong. */
export async function signIn(email: string, password: string): Promise<Session> {
  const session = await getApi().signIn(email, password);
  set({ status: "ready", session });
  return session;
}

/** Demo mode: sign in as one of the sample accounts without a password. */
export async function signInAsDemo(email: string): Promise<Session> {
  const session = await getApi().signInAsDemo(email);
  set({ status: "ready", session });
  return session;
}

export async function signOut(): Promise<void> {
  await getApi().signOut();
  set({ status: "ready", session: null });
}
