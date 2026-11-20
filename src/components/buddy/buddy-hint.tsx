"use client";

import { useEffect, useSyncExternalStore } from "react";
import { currentHint, pushHint, subscribeHint, type BuddyHintId } from "./buddy-store";

/**
 * Tells the Bona buddy which step this part of the page is, so its help fits.
 * Renders nothing. The hint is withdrawn when the component leaves the page.
 *
 *   <BuddyHint id="report.category" />
 *
 * Ids the buddy does not know fall back to general help.
 */
export function BuddyHint({ id }: { id: BuddyHintId | (string & {}) }) {
  useEffect(() => pushHint(id), [id]);
  return null;
}

/** The hint the page is announcing right now, or null when it announces none. */
export function useBuddyHint(): string | null {
  return useSyncExternalStore(subscribeHint, currentHint, () => null);
}

export { BUDDY_HINT_IDS, openBuddy, type BuddyHintId } from "./buddy-store";
