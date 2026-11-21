"use client";

import { useEffect } from "react";

/**
 * Scroll reveal for the landing page. Anything marked `data-reveal` inside a
 * `.vl` block fades up the first time it comes into view.
 *
 * The hidden state is only applied once this has started (the `vl-anim`
 * class), so the page is fully readable without scripts, in tests, in an
 * automated browser and on a browser with no IntersectionObserver. Reduced motion is handled in the CSS:
 * nothing is ever hidden there.
 */
export function RevealRoot() {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    // An automated browser takes whole-page pictures without scrolling: show everything.
    if (navigator.webdriver) return;
    const roots = Array.from(document.querySelectorAll<HTMLElement>(".vl"));
    const items = Array.from(document.querySelectorAll<HTMLElement>(".vl [data-reveal]"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.in = "";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    for (const root of roots) root.classList.add("vl-anim");
    for (const item of items) observer.observe(item);
    return () => {
      observer.disconnect();
      for (const root of roots) root.classList.remove("vl-anim");
      for (const item of items) delete item.dataset.in;
    };
  }, []);
  return null;
}
