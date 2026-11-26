"use client";

/**
 * The guided demo in the browser: one shared store for the guide strip and
 * the /demo page, so both show the same step. The step is always worked out
 * from the server's state (`GET /api/demo/guided`), never remembered here,
 * except whether the visitor chose to carry on with Check 2.
 */
import { useEffect, useSyncExternalStore } from "react";
import { setSessionFromServer } from "@/data/session";
import type { Session } from "@/data/types";
import type { PublicEscrow, RepairBudget } from "@/features/escrow/api";
import { detectStep, factsFrom, stepInfo, type DemoPerson, type StepInfo } from "./steps";

export type DemoLine = {
  lineId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  kind: "material" | "service";
};

export type GuidedDemo = {
  caseId: string;
  reference: string;
  title: string;
  description: string;
  location: string;
  schoolName: string;
  status: string;
  budget: RepairBudget | null;
  escrow: PublicEscrow | null;
  escrowError: string | null;
  shared: boolean;
  template: {
    lines: DemoLine[];
    amounts: [number, number];
    claimNotes: [string, string];
    reportNote: string;
    schoolDoneNote: string;
    challengeSeconds: number;
  };
};

export type GuidedState =
  | { status: "loading" }
  | { status: "off" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      demo: GuidedDemo | null;
      step: StepInfo | null;
      notice: string | null;
      /** Server clock minus this device's clock, seconds; for countdowns only. */
      clockSkew: number;
    };

const CONTINUED_KEY = "bona-demo-check2";

function readContinued(caseId: string): boolean {
  try {
    return window.localStorage.getItem(CONTINUED_KEY) === caseId;
  } catch {
    return false;
  }
}

let state: GuidedState = { status: "loading" };
let requested = false;
let notice: string | null = null;
const listeners = new Set<() => void>();
const LOADING: GuidedState = { status: "loading" };

function publish(next: GuidedState) {
  state = next;
  listeners.forEach((l) => l());
}

function ready(enabled: boolean, demo: GuidedDemo | null): GuidedState {
  if (!enabled) return { status: "off" };
  const step = demo
    ? stepInfo(detectStep(factsFrom(demo, readContinued(demo.caseId))))
    : null;
  const skew = demo?.escrow
    ? Number(demo.escrow.readAt) - Math.floor(Date.now() / 1000)
    : 0;
  return { status: "ready", demo, step, notice, clockSkew: skew };
}

async function call<T>(
  path: string,
  init?: { method: string; body?: unknown },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init?.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers:
        init?.body === undefined ? undefined : { "content-type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error("Could not reach the server. Check your connection.");
  }
  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? "Something went wrong. Try again.");
  }
  return body.data as T;
}

/** Reads the demo again from the server. */
export async function refreshGuided(): Promise<void> {
  requested = true;
  try {
    const data = await call<{ enabled: boolean; demo: GuidedDemo | null }>(
      "/api/demo/guided",
    );
    publish(ready(data.enabled, data.demo));
  } catch (e) {
    if (state.status !== "ready") {
      publish({ status: "error", message: (e as Error).message });
    }
  }
}

/** Starts the demo (or picks up this browser's case). A new case signs in as the School. */
export async function startGuided(restart = false): Promise<void> {
  const data = await call<{
    created: boolean;
    notice: string | null;
    demo: GuidedDemo | null;
  }>("/api/demo/guided", { method: "POST", body: { restart } });
  notice = data.notice;
  if (data.created && data.demo) {
    try {
      window.localStorage.removeItem(CONTINUED_KEY);
    } catch {
      // Private window: Check 2 just starts again after a refresh.
    }
    await reloadSessionFromServer();
  }
  publish(ready(true, data.demo));
}

async function reloadSessionFromServer() {
  const session = await call<Session | null>("/api/auth/session");
  setSessionFromServer(session);
}

/** "Demo: switch person". Public signs out. */
export async function switchPerson(person: DemoPerson): Promise<void> {
  const data = await call<{ session: Session | null }>("/api/demo/guided/person", {
    method: "POST",
    body: { person },
  });
  setSessionFromServer(data.session);
}

/** After step 7: carry on with Check 2. */
export function continueWithCheck2(caseId: string): void {
  try {
    window.localStorage.setItem(CONTINUED_KEY, caseId);
  } catch {
    // Without storage the choice lasts until the next refresh.
  }
  if (state.status === "ready" && state.demo) publish(ready(true, state.demo));
}

/** Plain POST helpers for the two case steps that are not escrow calls. */
export const demoActions = {
  logProblem: (caseId: string, note: string) =>
    call(`/api/issues/${encodeURIComponent(caseId)}/assessment`, {
      method: "POST",
      body: { note },
    }),
  confirmScope: () =>
    call<RepairBudget>("/api/demo/guided/scope", { method: "POST", body: {} }),
  priceCheck: () =>
    call<{
      lines: {
        lineId: string;
        level: "ok" | "check" | "high" | "unavailable";
        medianCents: number | null;
        percentAbove: number | null;
        offers: { retailer: string; url: string; title: string; priceCents: number }[];
        note: string;
      }[];
      overall: string;
      checkedAt: string;
    }>("/api/demo/guided/scope"),
  async schoolSaysDone(caseId: string, note: string) {
    const form = new FormData();
    form.set("note", note);
    const response = await fetch(
      `/api/issues/${encodeURIComponent(caseId)}/repair-claim`,
      {
        method: "POST",
        credentials: "include",
        body: form,
      },
    ).catch(() => null);
    if (!response) throw new Error("Could not reach the server. Check your connection.");
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(body.error?.message ?? "Something went wrong. Try again.");
    }
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGuided(): GuidedState {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );
  useEffect(() => {
    if (!requested) void refreshGuided();
  }, []);
  return current;
}
