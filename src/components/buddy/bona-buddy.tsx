"use client";

import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { useMessages } from "@/i18n";
import { BuddyChat, useBuddyAsk } from "./buddy-ask";
import { BUDDY_FACE_CSS, type BuddyMood } from "./buddy-face";
import { useBuddyHint } from "./buddy-hint";
import { resolveHint, subscribeOpen, type BuddyHintId } from "./buddy-store";
import { PET_PX, panelPlacement } from "./pet";
import { BuddyOptions, PetHearts } from "./pet-parts";
import { ABOVE_BUDDY, BUDDY_BOTTOM } from "./position";
import { ResizeGrip, clamp, loadSize, saveSize } from "./resize-grip";
import { RobotPet } from "./robot-pet";
import { STROLL_MS, usePet } from "./use-pet";

/**
 * The sign language concept preview is off until someone asks for it. Its
 * code (and three.js) is fetched at that moment, so "loading" and "error" are
 * real states a person can see.
 */
type Signer =
  | { status: "off" | "loading" | "error" }
  | { status: "on"; Panel: ComponentType<{ onClose: () => void }> };

/** Steps where something just worked, so the buddy looks pleased before it is opened. */
const HAPPY_HINTS: ReadonlySet<BuddyHintId> = new Set<BuddyHintId>(["receipt"]);

/** The bubble's size in px. Small by default; the corner grip makes it bigger. */
type Size = { w: number; h: number };
const SIZE_KEY = "bona:buddy:size";
const DEFAULT_SIZE: Size = { w: 340, h: 440 };
const MIN_SIZE: Size = { w: 280, h: 280 };
const MAX_SIZE: Size = { w: 640, h: 900 };

function fit(size: Size): Size {
  return {
    w: clamp(Math.round(size.w), MIN_SIZE.w, MAX_SIZE.w),
    h: clamp(Math.round(size.h), MIN_SIZE.h, MAX_SIZE.h),
  };
}

function savedSize(): Size {
  const saved = loadSize(SIZE_KEY) as Partial<Size> | null;
  if (saved && typeof saved.w === "number" && typeof saved.h === "number") {
    return fit({ w: saved.w, h: saved.h });
  }
  return DEFAULT_SIZE;
}

/**
 * Bona buddy: Bolt, a small robot on every page. Mounted once in the root
 * layout, outside <main>, inside its own Suspense boundary (it reads the
 * current path).
 *
 * It behaves like a pet (see use-pet.ts and pet.ts): on wide screens it
 * strolls now and then in the empty strips beside the content, never over it.
 * A tap opens a speech bubble beside it with only a chat: Bona's help for this
 * screen (see <BuddyHint>), short answers and questions to tap. Press and drag
 * to move it. Press and hold to make it react and show its options (sign
 * language preview, stay still); the bubble's "More options" shows the same
 * for keyboard users. Size and place are remembered on this device.
 */
export function BonaBuddy() {
  const m = useMessages();
  const b = m.buddy;
  const pathname = usePathname();
  const hintId = resolveHint(useBuddyHint(), pathname);
  const hint = b.hints[hintId];

  const [open, setOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [holdMenu, setHoldMenu] = useState(false);
  const ask = useBuddyAsk();
  const [signer, setSigner] = useState<Signer>({ status: "off" });
  // The bubble only renders after a click, so reading storage here cannot upset hydration.
  const [size, setSize] = useState<Size>(savedSize);
  const dragFrom = useRef<Size>(DEFAULT_SIZE);
  const resized = useRef(false);
  const signerRequest = useRef(0);
  const button = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const tipsId = useId();

  // Remember a size the person chose, on this device.
  useEffect(() => {
    if (resized.current) saveSize(SIZE_KEY, size);
  }, [size]);

  const openSheet = useCallback(() => {
    setHoldMenu(false);
    setOpen(true);
  }, [setHoldMenu]);
  const closeSheet = useCallback(() => setOpen(false), []);
  const closeAndReturn = useCallback(() => {
    setOpen(false);
    button.current?.focus();
  }, []);

  const pet = usePet(button, {
    paused: open || holdMenu || signer.status !== "off",
    onTap: () => (open ? closeSheet() : openSheet()),
    onHold: () => {
      setOpen(false);
      setHoldMenu(true);
    },
  });

  // Escape, or a press anywhere else, closes the hold menu.
  useEffect(() => {
    if (!holdMenu) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setHoldMenu(false);
    };
    const away = (event: Event) => {
      const target = event.target as Node | null;
      if (target && button.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-testid=bona-pet-menu]"))
        return;
      setHoldMenu(false);
    };
    window.addEventListener("keydown", key);
    document.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", away);
    };
  }, [holdMenu]);

  // Other parts of the page can open the buddy with openBuddy().
  useEffect(() => subscribeOpen(openSheet), [openSheet]);

  // Escape closes the bubble. Caught first, so the sign preview's own Escape stays shut.
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeAndReturn();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [open, closeAndReturn]);

  // Opening moves focus into the bubble, so keyboard and screen reader users land in it.
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);

  const closeSigner = useCallback(() => {
    signerRequest.current++;
    setSigner({ status: "off" });
    button.current?.focus();
  }, []);

  async function toggleSigner() {
    if (signer.status === "on" || signer.status === "loading") {
      signerRequest.current++;
      setSigner({ status: "off" });
      return;
    }
    const request = ++signerRequest.current;
    setSigner({ status: "loading" });
    try {
      // The only place this module is imported: three.js stays out of every page until now.
      const { SignPreview } = await import("./sign-preview");
      if (signerRequest.current !== request) return; // switched off while loading
      setSigner({ status: "on", Panel: SignPreview });
      // The figure follows text on the page, so get the bubble and menu out of the way.
      setOpen(false);
      setHoldMenu(false);
    } catch {
      if (signerRequest.current === request) setSigner({ status: "error" });
    }
  }

  let mood: BuddyMood = HAPPY_HINTS.has(hintId) ? "happy" : "resting";
  if (open) {
    if (ask.status === "thinking" || signer.status === "loading") mood = "thinking";
    else if (ask.status === "error" || signer.status === "error") mood = "concerned";
    else if (ask.status === "answer") mood = "happy";
    else mood = "listening";
  }
  if (pet.reacting || holdMenu) mood = "happy";

  // The bubble opens beside the robot once it has a place; before that, above the button.
  const place = pet.spot && pet.view ? panelPlacement(pet.spot, pet.view) : null;
  const pinnedLeft = place?.left !== undefined;
  const pinnedTop = place?.top !== undefined;
  const beside = place
    ? {
        left: place.left,
        right: place.right,
        top: place.top,
        bottom: place.bottom,
        transformOrigin: `${pinnedTop ? "top" : "bottom"} ${pinnedLeft ? "left" : "right"}`,
      }
    : { right: "0.75rem", bottom: ABOVE_BUDDY, transformOrigin: "bottom right" };
  const room = place ? `${place.room}px` : `calc(100dvh - ${ABOVE_BUDDY} - 0.75rem)`;
  // The speech-bubble tail points at the robot's middle.
  const tailX = Math.round(PET_PX / 2 - 8);

  const options = (
    <BuddyOptions
      signer={signer.status}
      onToggleSigner={() => void toggleSigner()}
      still={pet.still}
      onStill={pet.setStill}
    />
  );

  const tail = (
    <span
      aria-hidden="true"
      className={cn(
        "absolute size-4 rotate-45 border-line bg-surface",
        pinnedTop ? "-top-2 border-t border-l" : "-bottom-2 border-r border-b",
      )}
      style={pinnedLeft ? { left: tailX } : { right: tailX }}
    />
  );

  return (
    <aside aria-label={b.name} className="no-print">
      <style href="bona-buddy-face" precedence="default">
        {BUDDY_FACE_CSS}
      </style>
      <button
        ref={button}
        type="button"
        data-testid="bona-buddy"
        data-mood={mood}
        data-pet="robot"
        data-bona-sign-ignore
        aria-label={b.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={b.pet.howTo}
        {...pet.handlers}
        style={
          pet.spot
            ? {
                left: 0,
                top: 0,
                transform: `translate3d(${pet.spot.x}px, ${pet.spot.y}px, 0)`,
                transition: pet.dragging
                  ? "none"
                  : `transform ${STROLL_MS}ms cubic-bezier(0.45, 0.05, 0.35, 1)`,
              }
            : { right: "1rem", bottom: BUDDY_BOTTOM }
        }
        className={cn(
          "fixed z-30 inline-flex size-[52px] touch-none items-center justify-center rounded-full select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand",
          pet.dragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <span
          className={cn(
            "relative inline-flex drop-shadow-md",
            pet.strolling && "bona-pet-hop",
            pet.reacting && "bona-pet-wiggle",
            pet.dragging && "scale-110",
          )}
        >
          <RobotPet mood={mood} className="size-[52px]" />
        </span>
        {pet.reacting ? <PetHearts /> : null}
      </button>

      {signer.status === "on" ? <signer.Panel onClose={closeSigner} /> : null}

      {holdMenu ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-label={b.pet.title}
          data-testid="bona-pet-menu"
          data-bona-sign-ignore
          style={{ ...beside, width: "min(300px, calc(100vw - 1.5rem))" }}
          className="bona-pop fixed z-50 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 text-ink shadow-raised"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-base leading-tight">{b.pet.title}</h2>
              <p className="mt-0.5 text-xs text-muted">{b.pet.howTo}</p>
            </div>
            <button
              type="button"
              onClick={() => setHoldMenu(false)}
              aria-label={m.common.close}
              className="-mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
            >
              <Icon name="x" />
            </button>
          </div>
          {options}
          {tail}
        </section>
      ) : null}

      {open ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          data-testid="bona-buddy-panel"
          data-bona-sign-ignore
          style={{
            ...beside,
            width: `min(${size.w}px, calc(100vw - 1.5rem))`,
            height: `min(${size.h}px, ${room})`,
          }}
          className="bona-pop fixed z-50 flex flex-col rounded-3xl border border-line bg-surface text-ink shadow-raised"
        >
          <header
            className={cn(
              "flex shrink-0 items-center gap-1 border-b border-line py-1.5 pr-1.5 pl-3",
              pinnedLeft && "flex-row-reverse pr-3 pl-1.5",
            )}
          >
            <h2
              ref={heading}
              id={titleId}
              tabIndex={-1}
              className={cn(
                "min-w-0 flex-1 text-base leading-tight outline-none",
                pinnedLeft && "text-right",
              )}
            >
              {b.sheetTitle}
            </h2>
            <ResizeGrip
              label={b.resize}
              invertX={pinnedLeft}
              invertY={pinnedTop}
              onStart={() => {
                resized.current = true;
                dragFrom.current = size;
              }}
              onDrag={(x, y) =>
                setSize(fit({ w: dragFrom.current.w + x, h: dragFrom.current.h + y }))
              }
              onStep={(x, y) => {
                resized.current = true;
                setSize((now) => fit({ w: now.w + x, h: now.h + y }));
              }}
            />
            <button
              type="button"
              aria-expanded={optionsOpen}
              aria-label={b.moreOptions}
              onClick={() => setOptionsOpen((on) => !on)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
            >
              <Icon name="menu" className="size-5" />
            </button>
            <button
              type="button"
              onClick={closeAndReturn}
              aria-label={m.common.close}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
            >
              <Icon name="x" />
            </button>
          </header>

          {optionsOpen ? (
            <div className="shrink-0 border-b border-line bg-canvas px-3 py-3">
              {options}
            </div>
          ) : null}

          <div data-testid="bona-buddy-sheet" className="flex min-h-0 flex-1 flex-col">
            <BuddyChat
              state={ask}
              greeting={
                <div data-hint={hintId}>
                  <h3 id={tipsId} className="text-sm font-bold">
                    {hint.title}
                  </h3>
                  {hint.tips.map((tip) => (
                    <p key={tip} className="mt-1 text-sm">
                      {tip}
                    </p>
                  ))}
                </div>
              }
              suggestions={b.suggestions}
              showFullPageLink={pathname !== "/assistant"}
              onNavigate={closeSheet}
            />
          </div>
          {tail}
        </section>
      ) : null}
    </aside>
  );
}
