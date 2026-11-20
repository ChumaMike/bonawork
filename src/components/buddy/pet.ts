/*
 * Where the Bona buddy may sit and stroll. Pure functions, so they are easy to
 * test; the hook in use-pet.ts and <BonaBuddy> do the moving.
 *
 * The page's content is a centred column at most 72rem (1152 px) wide (the
 * header, main and footer all use max-w-6xl). On a screen wider than that
 * plus room for the buddy, the strips beside the column are empty: the buddy
 * strolls there and never over content. On narrower screens it stays tucked
 * against the left or right edge, where it has always been.
 */

export type Point = { x: number; y: number };
/** The viewport, and how much room at the bottom belongs to the page (menus, action bars). */
export type View = { w: number; h: number; bottomReserve: number };

export const PET_PX = 52;
export const CONTENT_MAX_PX = 1152;
const EDGE = 16;
/** Below the header and the sample-data notice. */
const TOP_SAFE = 96;
/** The longest single stroll, so it ambles instead of teleporting. */
const MAX_STEP = 260;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function gutterWidth(w: number) {
  return Math.max(0, (w - CONTENT_MAX_PX) / 2);
}

/** True when the strips beside the content are wide enough for the buddy. */
export function hasGutter(w: number) {
  return gutterWidth(w) >= PET_PX + 2 * EDGE;
}

function yRange(view: View) {
  const max = Math.max(TOP_SAFE, view.h - view.bottomReserve - PET_PX);
  return { min: Math.min(TOP_SAFE, max), max };
}

/** The x range of the strip on one side: the gutter if there is one, else the edge itself. */
function xRange(view: View, side: "left" | "right") {
  if (!hasGutter(view.w)) {
    const x = side === "left" ? EDGE : view.w - PET_PX - EDGE;
    return { min: x, max: x };
  }
  const g = gutterWidth(view.w);
  return side === "left"
    ? { min: EDGE, max: g - PET_PX - EDGE }
    : { min: view.w - g + EDGE, max: view.w - PET_PX - EDGE };
}

export const sideOf = (p: Point, view: View): "left" | "right" =>
  p.x + PET_PX / 2 < view.w / 2 ? "left" : "right";

/** Where the buddy starts: bottom right, where the help button always was. */
export function homeSpot(view: View): Point {
  return { x: view.w - PET_PX - EDGE, y: yRange(view).max };
}

/** After a drop or a resize: keep it on its side, out of the content, on screen. */
export function settle(p: Point, view: View): Point {
  const xs = xRange(view, sideOf(p, view));
  const ys = yRange(view);
  return { x: clamp(p.x, xs.min, xs.max), y: clamp(p.y, ys.min, ys.max) };
}

/** While dragging it can go anywhere on screen; it settles when let go. */
export function onScreen(p: Point, view: View): Point {
  return {
    x: clamp(p.x, 0, view.w - PET_PX),
    y: clamp(p.y, 0, view.h - PET_PX),
  };
}

/**
 * The next spot for a stroll: somewhere nearby in the same strip. It never
 * crosses the content to the other side. Without a gutter it stays put.
 */
export function strollTarget(p: Point, view: View, random = Math.random): Point {
  if (!hasGutter(view.w)) return settle(p, view);
  const xs = xRange(view, sideOf(p, view));
  const ys = yRange(view);
  const pick = (from: number, min: number, max: number) =>
    clamp(from + (random() * 2 - 1) * MAX_STEP, min, max);
  return { x: pick(p.x, xs.min, xs.max), y: pick(p.y, ys.min, ys.max) };
}

/**
 * Where a panel opens beside the buddy: on its side of the screen, above it
 * when it sits low and below it when it sits high, never taller than the room.
 */
export function panelPlacement(p: Point, view: View) {
  const gap = 10;
  const horizontal =
    sideOf(p, view) === "left"
      ? { left: Math.max(12, p.x) }
      : { right: Math.max(12, view.w - p.x - PET_PX) };
  // Open on whichever side of the buddy has more room.
  const below = view.h - (p.y + PET_PX) > p.y;
  const vertical = below
    ? { top: p.y + PET_PX + gap, room: view.h - (p.y + PET_PX + gap) - 12 }
    : { bottom: view.h - p.y + gap, room: p.y - gap - 12 };
  const { room, ...edge } = vertical;
  return { ...horizontal, ...edge, room: Math.max(200, room) };
}
