import { Suspense, type ReactNode } from "react";
import { HydrationMarker } from "./hydration-marker";
import { Container, Loading } from "./page";

/**
 * Screens read the URL and load their data in the browser. With Cache
 * Components enabled, that work must sit inside a Suspense boundary so the
 * page shell can still be prerendered.
 */
export function ScreenBoundary({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Container>
          <Loading />
        </Container>
      }
    >
      {children}
      <HydrationMarker />
    </Suspense>
  );
}
