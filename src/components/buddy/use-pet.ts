"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import { loadSize, saveSize } from "./resize-grip";
import { onScreen, settle, strollTarget, type Point, type View } from "./pet";

const SPOT_KEY = "bona:buddy:spot";
const STILL_KEY = "bona:buddy:still";
/** Hold this long without moving and the pet reacts and offers its menu. */
const HOLD_MS = 450;
/** Move this far and a press becomes a drag. */
const DRAG_PX = 6;
/** How long one stroll takes; matches the CSS transition in bona-buddy.tsx. */
export const STROLL_MS = 1600;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);

/**
 * The Bona buddy as a pet: where it is, which pet it is, and the pointer
 * handlers for its button. A short tap is a normal click (it opens help). A
 * press that moves drags it, and it settles beside the content when let go.
 * A press that holds still makes it react and calls `onHold` (the pet menu).
 *
 * Until it has measured the page, `spot` is null and the button keeps its
 * plain CSS place, so the server and the browser render the same thing.
 */
export function usePet(
  button: RefObject<HTMLButtonElement | null>,
  { paused, onHold, onTap }: { paused: boolean; onHold: () => void; onTap: () => void },
) {
  const [still, setStill] = useState(false);
  const [spot, setSpot] = useState<Point | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [strolling, setStrolling] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reacting, setReacting] = useState(false);
  // It stays put under the pointer, so it never walks away from a tap.
  const [hovered, setHovered] = useState(false);

  const viewRef = useRef<View | null>(null);
  const press = useRef<{ x: number; y: number; from: Point; held: boolean } | null>(null);
  const holdTimer = useRef(0);
  const swallowClick = useRef(false);

  // Measure once the page is laid out, then read what this device remembers.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const el = button.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const measured: View = {
        w: window.innerWidth,
        h: window.innerHeight,
        bottomReserve: Math.max(0, window.innerHeight - rect.bottom),
      };
      const saved = loadSize(SPOT_KEY) as Partial<Point> | null;
      const start =
        saved && typeof saved.x === "number" && typeof saved.y === "number"
          ? { x: saved.x, y: saved.y }
          : { x: rect.left, y: rect.top };
      viewRef.current = measured;
      setView(measured);
      setSpot(settle(start, measured));
      setStill(loadSize(STILL_KEY) === true);
    });
    return () => cancelAnimationFrame(frame);
  }, [button]);

  // Keep it beside the content when the window changes size.
  useEffect(() => {
    const resize = () => {
      const old = viewRef.current;
      if (!old) return;
      const next = { ...old, w: window.innerWidth, h: window.innerHeight };
      viewRef.current = next;
      setView(next);
      setSpot((p) => (p ? settle(p, next) : p));
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Stroll now and then, when nothing else is going on.
  useEffect(() => {
    if (!spot || !view || paused || still || dragging || hovered || reducedMotion())
      return;
    // Rarely, so it is easy to tap.
    const wait = 25000 + Math.random() * 20000;
    let done = 0;
    const timer = window.setTimeout(() => {
      if (document.hidden) return;
      setStrolling(true);
      setSpot(strollTarget(spot, view));
      done = window.setTimeout(() => setStrolling(false), STROLL_MS);
    }, wait);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(done);
    };
  }, [spot, view, paused, still, dragging, hovered]);

  const react = useCallback(() => {
    setReacting(true);
    window.setTimeout(() => setReacting(false), 1200);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !spot) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    press.current = { x: event.clientX, y: event.clientY, from: spot, held: false };
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      if (!press.current) return;
      press.current.held = true;
      react();
      onHold();
    }, HOLD_MS);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const p = press.current;
    if (!p || !view) return;
    const dx = event.clientX - p.x;
    const dy = event.clientY - p.y;
    if (!dragging) {
      if (Math.hypot(dx, dy) < DRAG_PX) return;
      window.clearTimeout(holdTimer.current);
      setStrolling(false);
      setDragging(true);
    }
    setSpot(onScreen({ x: p.from.x + dx, y: p.from.y + dy }, view));
  };

  const finish = () => {
    window.clearTimeout(holdTimer.current);
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (dragging) {
      setDragging(false);
      swallowClick.current = true;
      setSpot((now) => {
        if (!now || !view) return now;
        const landed = settle(now, view);
        saveSize(SPOT_KEY, landed);
        return landed;
      });
      return;
    }
    if (p.held) swallowClick.current = true;
  };

  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      event.preventDefault();
      return;
    }
    onTap();
  };

  return {
    still,
    spot,
    view,
    strolling,
    dragging,
    reacting,
    react,
    setStill: (next: boolean) => {
      setStill(next);
      saveSize(STILL_KEY, next);
    },
    handlers: {
      onPointerEnter: () => setHovered(true),
      onPointerLeave: () => setHovered(false),
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: finish,
      onClick,
      onContextMenu: (event: MouseEvent) => event.preventDefault(),
    },
  };
}
