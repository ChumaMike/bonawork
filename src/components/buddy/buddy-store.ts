/*
 * What the Bona buddy knows about the page it is floating over.
 *
 * A tiny store outside React (the same shape as the toast store) so a page can
 * say "this is the photo step" with <BuddyHint id="report.photo" /> and the
 * buddy, which is mounted once in the root layout, shows the right tips.
 */

/** Every step the buddy has tips for. The words are in the `buddy.hints` i18n section. */
export const BUDDY_HINT_IDS = [
  "report.school",
  "report.category",
  "report.describe",
  "report.photo",
  "report.review",
  "report",
  "receipt",
  "issue",
  "school",
  "home",
  "track",
  "verify",
  "admin",
  "reviewer",
  "fallback",
] as const;

export type BuddyHintId = (typeof BUDDY_HINT_IDS)[number];

/** Shown when a page names no step, or names one the buddy does not know. */
export const FALLBACK_HINT: BuddyHintId = "fallback";

const KNOWN: ReadonlySet<string> = new Set(BUDDY_HINT_IDS);

export function isBuddyHintId(id: unknown): id is BuddyHintId {
  return typeof id === "string" && KNOWN.has(id);
}

/**
 * A best guess from the address alone, for pages that render no <BuddyHint>.
 * A hint set by the page always wins over this.
 */
export function hintForPath(pathname: string | null | undefined): BuddyHintId {
  if (!pathname) return FALLBACK_HINT;
  const [first = "", second] = pathname.split("/").filter(Boolean);
  switch (first) {
    case "":
      return "home";
    case "report":
      return "report";
    case "receipts":
      return "receipt";
    case "issues":
      return second ? "issue" : FALLBACK_HINT;
    case "schools":
      return second ? "school" : "home";
    case "track":
    case "verify":
    case "admin":
    case "reviewer":
      return first;
    default:
      return FALLBACK_HINT;
  }
}

/** The hint to show: the page's own if the buddy knows it, else the guess from the address. */
export function resolveHint(
  current: string | null | undefined,
  pathname?: string | null,
): BuddyHintId {
  return isBuddyHintId(current) ? current : hintForPath(pathname);
}

/* ------------------------------------------------------------------------ */
/* Current hint: a stack, so a step inside a page wins over the page itself  */
/* and the page's hint comes back when the step leaves.                      */
/* ------------------------------------------------------------------------ */

type Entry = { key: number; id: string };

let stack: Entry[] = [];
let nextKey = 1;
const hintListeners = new Set<() => void>();

function emit(listeners: Set<() => void>) {
  for (const listener of listeners) listener();
}

/** Announce a hint. Returns the function that withdraws it again. */
export function pushHint(id: string): () => void {
  const key = nextKey++;
  stack = [...stack, { key, id }];
  emit(hintListeners);
  return () => {
    if (!stack.some((entry) => entry.key === key)) return;
    stack = stack.filter((entry) => entry.key !== key);
    emit(hintListeners);
  };
}

/** The most recently announced hint that is still on the page, or null. */
export function currentHint(): string | null {
  return stack.length ? stack[stack.length - 1].id : null;
}

export function subscribeHint(listener: () => void): () => void {
  hintListeners.add(listener);
  return () => {
    hintListeners.delete(listener);
  };
}

/* ------------------------------------------------------------------------ */
/* Opening the buddy from somewhere else on the page                         */
/* ------------------------------------------------------------------------ */

const openListeners = new Set<() => void>();

/** Open the buddy's help sheet, for example from an "Ask for help" link. */
export function openBuddy() {
  emit(openListeners);
}

export function subscribeOpen(listener: () => void): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

/** For tests: forget every hint. */
export function resetBuddyStore() {
  stack = [];
  emit(hintListeners);
}
