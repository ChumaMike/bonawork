"use client";

import { useEffect, useState, type RefObject } from "react";
import { hasGutter, type Point } from "./pet";

/** Things a person can press or type in. The buddy must never sit on one. */
const CONTROL =
  'a[href],button,input,select,textarea,summary,label,[role="button"],[role="tab"],[role="link"],[tabindex]:not([tabindex="-1"])';
/** How far it moves up per try, and how many tries. */
const STEP_PX = 60;
const TRIES = 6;
/** It never climbs into the top bar. */
const TOP_SAFE = 96;

/** True when a control of the page lies under any of these points. */
function coversControl(points: [number, number][], own: Element | null) {
  if (typeof document.elementsFromPoint !== "function") return false;
  return points.some(([x, y]) => {
    const under = document
      .elementsFromPoint(x, y)
      .find((element) => !own?.contains(element));
    return Boolean(under?.closest(CONTROL));
  });
}

/**
 * On a phone or a narrow window the buddy sits at the screen's edge, over
 * the page. When a button or a field of the page scrolls under it (the
 * landing page's "Find school", a sticky form), this returns how many px to
 * lift it so the control stays free. Zero on wide screens, where it lives in
 * the empty strips beside the content.
 */
export function useDodge(
  button: RefObject<HTMLButtonElement | null>,
  spot: Point | null,
  paused: boolean,
  /** Look again when this changes (the page's path). */
  page: string,
) {
  const [lift, setLift] = useState(0);

  useEffect(() => {
    if (!spot || paused) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const el = button.current;
      if (!el || hasGutter(window.innerWidth)) {
        setLift(0);
        return;
      }
      const own = el.closest("aside");
      const size = el.offsetWidth || 52;
      const inset = 6;
      const left = spot.x + inset;
      const right = spot.x + size - inset;
      const mid = spot.x + size / 2;
      for (let step = 0; step <= TRIES; step++) {
        const top = spot.y - step * STEP_PX;
        if (top < TOP_SAFE) break;
        const bottom = top + size;
        const points: [number, number][] = [
          [mid, top + size / 2],
          [left, top + inset],
          [right, top + inset],
          [left, bottom - inset],
          [right, bottom - inset],
        ];
        if (!coversControl(points, own)) {
          setLift(step * STEP_PX);
          return;
        }
      }
      setLift(0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Pages draw their content after data arrives; look again shortly after.
    const later = window.setTimeout(schedule, 800);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [button, spot, paused, page]);

  return lift;
}
