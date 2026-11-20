"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/components/ui/cn";

/** How far one arrow key press grows or shrinks a panel. */
export const RESIZE_STEP_PX = 24;

/**
 * A corner handle for a panel that is pinned to the bottom-right of the
 * screen, so it grows up and to the left. Drag it with a pointer, or focus it
 * and use the arrow keys (left and up grow, right and down shrink).
 *
 * The parent owns the size. `onStart` asks it to remember the size at the
 * start of a drag; `onDrag` then gets how far the pointer has moved since,
 * as growth in px; `onStep` gets one key press worth of growth.
 */
export function ResizeGrip({
  label,
  onStart,
  onDrag,
  onStep,
  invertX = false,
  invertY = false,
  className,
}: {
  label: string;
  onStart: () => void;
  onDrag: (growX: number, growY: number) => void;
  onStep: (growX: number, growY: number) => void;
  /** The panel is pinned on the left, so dragging right grows it. */
  invertX?: boolean;
  /** The panel is pinned at the top, so dragging down grows it. */
  invertY?: boolean;
  className?: string;
}) {
  const from = useRef<{ x: number; y: number } | null>(null);

  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    from.current = { x: event.clientX, y: event.clientY };
    onStart();
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (!from.current) return;
    const x = from.current.x - event.clientX;
    const y = from.current.y - event.clientY;
    onDrag(invertX ? -x : x, invertY ? -y : y);
  };
  const up = () => {
    from.current = null;
  };
  const key = (event: KeyboardEvent<HTMLButtonElement>) => {
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [RESIZE_STEP_PX, 0],
      ArrowRight: [-RESIZE_STEP_PX, 0],
      ArrowUp: [0, RESIZE_STEP_PX],
      ArrowDown: [0, -RESIZE_STEP_PX],
    };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    onStep(invertX ? -step[0] : step[0], invertY ? -step[1] : step[1]);
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid="resize-grip"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
      className={cn(
        invertX !== invertY ? "cursor-nesw-resize" : "cursor-nwse-resize",
        "inline-flex size-8 shrink-0 touch-none items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink",
        className,
      )}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="size-4"
        aria-hidden="true"
      >
        <path
          d="M3 13L13 3M3 8.5L8.5 3M3 4l1-1"
          transform={`translate(${invertX ? 16 : 0} ${invertY ? 16 : 0}) scale(${invertX ? -1 : 1} ${invertY ? -1 : 1})`}
        />
      </svg>
    </button>
  );
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/* Remembered on this device only; everything works without it. */
export function loadSize(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function saveSize(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window or blocked storage: it just will not be remembered */
  }
}
