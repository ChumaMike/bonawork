import { Suspense, type ReactNode } from "react";
import { HydrationMarker } from "./hydration-marker";
import { PageLoading } from "./page";

/**
 * Screens read the URL and load their data in the browser. With Cache
 * Components enabled, that work must sit inside a Suspense boundary so the
 * page shell can still be prerendered.
 */
export function ScreenBoundary({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<PageLoading />}>
      {children}
      <HydrationMarker />
    </Suspense>
  );
}
