"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Renders an invisible marker once this part of the page is interactive.
 * Browser tests wait for it so they never click a control before React has
 * attached its handlers.
 */
export function HydrationMarker() {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return hydrated ? <span data-testid="hydrated" hidden /> : null;
}
