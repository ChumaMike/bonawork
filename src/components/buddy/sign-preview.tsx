"use client";

/*
 * Sign language CONCEPT preview. Ported from the Gcina project
 * (web/src/components/sasl-preview.tsx).
 *
 * This is NOT real sign language. A stylised 3D figure shows where a future
 * South African Sign Language avatar would sit and what it would follow. Turn
 * it on from the Bona buddy sheet, then point at, tap or tab to any text: the
 * text is outlined, each word lights up on the page in turn, and the figure
 * makes a made-up hand shape and movement for that word. A real avatar needs a
 * Deaf-community partner, and the panel says so for as long as it is open.
 *
 * Read aloud is optional and uses only an English voice that is installed on
 * the device, so nothing is sent to a server. Gcina's translation into other
 * languages needed a server route and is not part of this port.
 *
 * The whole module, with three.js, is downloaded only when the preview is
 * switched on (a dynamic import in bona-buddy.tsx). Never import it statically.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { useMessages } from "@/i18n";
import { ABOVE_BUDDY } from "./position";
import { ResizeGrip, clamp } from "./resize-grip";
import { createSignFigure, type SignCue, type SignFigure } from "./sign-figure";
import { markWord, pickTarget, wordMs, wordsIn, type PageWord } from "./sign-words";

const HOVER_MS = 140;

/* Remembered on this device only; the panel works without it. */
const PREF = "bona:sign:";
function loadPref(key: string): string | null {
  try {
    return window.localStorage.getItem(PREF + key);
  } catch {
    return null;
  }
}
function savePref(key: string, value: string) {
  try {
    window.localStorage.setItem(PREF + key, value);
  } catch {
    /* private window or blocked storage: it just will not be remembered */
  }
}

/*
 * The figure's width in px; its height follows at 6:5. The minus and plus
 * buttons jump between these named sizes, and the corner grip sets any width
 * between the smallest and the largest. It opens small.
 */
const SIZES = [
  { id: "s", w: 132 },
  { id: "m", w: 164 },
  { id: "l", w: 220 },
  { id: "xl", w: 290 },
] as const;
const MIN_W = SIZES[0].w;
const MAX_W = SIZES[SIZES.length - 1].w;
const RATIO = 1.2;

function savedWidth(): number {
  const saved = loadPref("size");
  const named = SIZES.find((size) => size.id === saved);
  if (named) return named.w;
  const px = Number(saved);
  return Number.isFinite(px) && px > 0 ? clamp(Math.round(px), MIN_W, MAX_W) : MIN_W;
}
/** The named size nearest to a width, for the size announcement. */
function nearestSize(w: number) {
  return SIZES.reduce((best, size) =>
    Math.abs(size.w - w) < Math.abs(best.w - w) ? size : best,
  );
}

/*
 * The outline around the chosen text and the lit word. Token colours only.
 * Sun is a background here, with dark text on it in both themes. No quotes or
 * angle brackets: React escapes those in a style element.
 */
const SIGN_CSS = `
.bona-sign-target:not(:focus-visible) { outline: 2px dashed var(--color-accent); outline-offset: 3px; }
::highlight(bona-sign-word) { background-color: var(--color-sun); color: var(--color-ink); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme=light]) ::highlight(bona-sign-word) { color: var(--color-canvas); }
}
`;

const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

function canDraw3d(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    // Hand the test context straight back; phones allow only a few at a time.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

/**
 * An English voice that lives on the device. Voices that are not local send
 * the text to a speech service, so they are never used.
 */
function localEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const lang = (voice: SpeechSynthesisVoice) =>
    voice.lang.toLowerCase().replace("_", "-");
  const english = voices.filter(
    (voice) => voice.localService && lang(voice).split("-")[0] === "en",
  );
  return english.find((voice) => lang(voice) === "en-za") ?? english[0] ?? null;
}

/* Icons the shared set does not have, drawn to the same 24 px grid. */
const glyphs = {
  minus: <path d="M5 12h14" />,
  replay: (
    <>
      <path d="M4 12a8 8 0 1 0 2.6-5.9" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  speakerOff: (
    <>
      <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

function Glyph({ name }: { name: keyof typeof glyphs }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
      aria-hidden="true"
    >
      {glyphs[name]}
    </svg>
  );
}

const chip =
  "inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const chipOff = "border-line-strong bg-surface text-ink hover:border-brand";
const chipOn = "border-brand bg-brand text-on-brand";
const round =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-surface text-ink hover:border-brand disabled:cursor-not-allowed disabled:opacity-50";

export function SignPreview({ onClose }: { onClose: () => void }) {
  const s = useMessages().buddy.sign;
  const no3d = s.no3d;
  const [words, setWords] = useState<string[]>([]);
  const [current, setCurrent] = useState(-1);
  const [run, setRun] = useState(0);
  const [slow, setSlow] = useState(false);
  const [figureW, setFigureW] = useState(savedWidth);
  const dragFrom = useRef<number>(MIN_W);
  const [viewW, setViewW] = useState(() => window.innerWidth);
  const [voiceOn, setVoiceOn] = useState(() => loadPref("voice") === "on");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    canSpeak() ? window.speechSynthesis.getVoices() : [],
  );
  const [draws3d] = useState(canDraw3d);

  const active = useRef<Element | null>(null);
  const wordRefs = useRef<PageWord[]>([]);
  const cue = useRef<SignCue | null>(null);
  const waving = useRef(true);
  const speechDriven = useRef(false);
  const mount = useRef<HTMLDivElement | null>(null);
  const figure = useRef<SignFigure | null>(null);

  const speaks = canSpeak();
  const voice = useMemo(() => localEnglishVoice(voices), [voices]);

  useEffect(() => {
    const onResize = () => setViewW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // The device's voices arrive a moment after the page in most browsers.
  useEffect(() => {
    if (!speaks) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(synth.getVoices());
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, [speaks]);

  const size = nearestSize(figureW);
  // Never wider than the phone: keep the gutters plus the panel's padding.
  const stage = useMemo(() => {
    const w = Math.min(figureW, Math.max(110, viewW - 56));
    return { w, h: Math.round(w * RATIO) };
  }, [figureW, viewW]);
  const stacked = figureW >= SIZES[2].w || !draws3d;

  const replay = useCallback(() => {
    setCurrent(0);
    setRun((n) => n + 1);
  }, []);
  const setWidth = (w: number) => {
    const next = clamp(Math.round(w), MIN_W, MAX_W);
    setFigureW(next);
    savePref("size", String(next));
  };
  /** Minus and plus: the next named size down or up from where it is now. */
  const resize = (step: number) => {
    const next =
      step > 0
        ? SIZES.find((named) => named.w > figureW)
        : [...SIZES].reverse().find((named) => named.w < figureW);
    if (next) setWidth(next.w);
  };
  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    savePref("voice", next ? "on" : "off");
    if (!words.length) return;
    // On: start the sentence again so the voice and the lit word stay together.
    // Off: the voice was setting the pace, so hand it back to the timer.
    if (next) replay();
    else setRun((n) => n + 1);
  };
  const toggleSlow = () => {
    setSlow((value) => !value);
    if (voiceOn && words.length) replay();
  };

  // Pick up the text under the pointer (or keyboard focus) and outline it.
  useEffect(() => {
    let timer = 0;
    const choose = (from: Element) => {
      const el = pickTarget(from);
      if (!el || el === active.current) return;
      const found = wordsIn(el);
      if (!found.length) return;
      active.current?.classList.remove("bona-sign-target");
      el.classList.add("bona-sign-target");
      active.current = el;
      wordRefs.current = found;
      setWords(found.map((word) => word.text));
      setCurrent(0);
      setRun((n) => n + 1);
    };
    const over = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target;
      window.clearTimeout(timer);
      // A short wait for the mouse so sweeping across the page does not flicker; touch is instant.
      timer = window.setTimeout(
        () => choose(target),
        event.pointerType === "mouse" ? HOVER_MS : 0,
      );
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Element) choose(event.target);
    };
    document.addEventListener("pointerover", over, { passive: true });
    document.addEventListener("focusin", focus);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("focusin", focus);
      active.current?.classList.remove("bona-sign-target");
      active.current = null;
      wordRefs.current = [];
      cue.current = null;
      markWord(undefined);
    };
  }, []);

  // Escape closes the preview, unless a sheet or dialog is open and needs the key itself.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  // Step through the words; light each one up on the page.
  // While a voice is reading, its word boundaries drive this instead of the timer.
  useEffect(() => {
    waving.current = words.length === 0;
    const word = words[current];
    if (word === undefined) {
      cue.current = null;
      markWord(undefined);
      return;
    }
    const dur = wordMs(word) * (slow ? 1.7 : 1);
    cue.current = { word, start: performance.now(), dur };
    markWord(wordRefs.current[current]);
    if (speechDriven.current) return;
    const timer = setTimeout(() => setCurrent((index) => index + 1), dur);
    return () => clearTimeout(timer);
  }, [current, words, slow, run]);

  // Read it aloud (optional), with a voice that is on the device.
  useEffect(() => {
    speechDriven.current = false;
    if (!speaks) return;
    const synth = window.speechSynthesis;
    if (!voiceOn || !voice || !words.length) {
      synth.cancel();
      return;
    }
    let cancelled = false;
    let heard = false;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(words.join(" "));
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.rate = slow ? 0.78 : 1;
    // Map the voice's position back to the word on the page, so the lit word and the figure follow the voice.
    const starts: number[] = [];
    let at = 0;
    for (const word of words) {
      starts.push(at);
      at += word.length + 1;
    }
    utterance.onboundary = (event) => {
      if (cancelled || event.name !== "word") return;
      heard = true;
      speechDriven.current = true;
      let index = 0;
      while (index + 1 < starts.length && starts[index + 1] <= event.charIndex) index++;
      setCurrent(index);
    };
    utterance.onend = () => {
      if (cancelled || !heard) return;
      speechDriven.current = false;
      setCurrent(words.length);
    };
    utterance.onerror = () => {
      if (cancelled) return;
      speechDriven.current = false;
      // The voice stopped part-way: let the timer carry on from the next word.
      if (heard) setCurrent((index) => index + 1);
    };
    // Some voices never report word boundaries: the timer keeps stepping instead.
    synth.speak(utterance);
    return () => {
      cancelled = true;
      speechDriven.current = false;
      synth.cancel();
    };
    // `slow` is left out on purpose: Slower restarts the sentence through `run`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaks, voiceOn, voice, words, run]);

  // The 3D figure.
  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    const made = createSignFigure(host, {
      cue: () => cue.current,
      waving: () => waving.current,
      reduceMotion:
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    });
    figure.current = made;
    // The check above passed but the renderer still could not start: say so.
    if (!made) host.textContent = no3d;
    return () => {
      made?.dispose();
      figure.current = null;
      host.textContent = "";
    };
  }, [draws3d, no3d]);

  // Resize the canvas without rebuilding the figure.
  useEffect(() => {
    figure.current?.resize(stage.w, stage.h);
  }, [stage.w, stage.h]);

  const done = words.length > 0 && current >= words.length;
  const panelW = stacked ? Math.max(stage.w + 26, 240) : 300;
  const noVoice = speaks && voiceOn && words.length > 0 && !voice;

  return (
    <section
      aria-label={s.title}
      data-testid="bona-sign-preview"
      data-bona-sign-ignore
      style={{
        // Sits just above the buddy button and never taller than the space left.
        bottom: ABOVE_BUDDY,
        maxHeight: `calc(100dvh - ${ABOVE_BUDDY} - 0.75rem)`,
        width: `min(${panelW}px, calc(100% - 1.5rem))`,
      }}
      className="bona-pop-sign fixed right-3 z-40 overflow-y-auto rounded-2xl border border-line bg-surface p-3 text-ink shadow-raised"
    >
      <style href="bona-sign-preview" precedence="default">
        {SIGN_CSS}
      </style>
      <div className="flex items-start justify-between gap-2">
        {draws3d ? (
          <ResizeGrip
            label={s.resize}
            className="-mt-1 -ml-1"
            onStart={() => {
              dragFrom.current = figureW;
            }}
            onDrag={(x, y) => setWidth(dragFrom.current + Math.max(x, y / RATIO))}
            onStep={(x, y) => setWidth(figureW + (x || y / RATIO))}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{s.title}</p>
          <p className="mt-0.5 inline-flex rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-strong">
            {s.badge}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={s.close}
          title={s.close}
          className="-mt-1 -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
        >
          <Icon name="x" />
        </button>
      </div>

      <div className={cn("mt-2 flex gap-3", stacked ? "flex-col" : "items-center")}>
        {draws3d ? (
          <div
            ref={mount}
            style={{ width: stage.w, height: stage.h }}
            className={cn(
              "shrink-0 overflow-hidden rounded-xl border border-line bg-brand-soft",
              stacked && "self-center",
            )}
          />
        ) : (
          <p className="rounded-xl bg-sunken p-3 text-sm text-muted">{s.no3d}</p>
        )}
        <div className="min-w-0 flex-1 text-sm" aria-live="polite">
          {words.length ? (
            <p className={cn("leading-relaxed", figureW >= MAX_W && "text-base")}>
              {words.map((word, index) => (
                <span
                  key={index}
                  className={
                    index === current
                      ? "rounded bg-brand px-0.5 font-semibold text-on-brand"
                      : index < current
                        ? "text-muted"
                        : undefined
                  }
                >
                  {word}{" "}
                </span>
              ))}
            </p>
          ) : (
            <p className="text-muted">{s.prompt}</p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={replay}
          disabled={!words.length}
          className={cn(chip, chipOff)}
        >
          <Glyph name="replay" />
          {done ? s.again : s.replay}
        </button>
        <button
          type="button"
          onClick={toggleSlow}
          aria-pressed={slow}
          className={cn(chip, slow ? chipOn : chipOff)}
        >
          <Icon name="clock" className="size-4" />
          {s.slower}
        </button>
        {speaks ? (
          <button
            type="button"
            onClick={toggleVoice}
            aria-pressed={voiceOn}
            className={cn(chip, voiceOn ? chipOn : chipOff)}
          >
            <Glyph name={voiceOn ? "speaker" : "speakerOff"} />
            {s.readAloud}
          </button>
        ) : null}
        {draws3d ? (
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => resize(-1)}
              disabled={figureW <= MIN_W}
              aria-label={s.smaller}
              title={s.smaller}
              className={round}
            >
              <Glyph name="minus" />
            </button>
            <button
              type="button"
              onClick={() => resize(1)}
              disabled={figureW >= MAX_W}
              aria-label={s.bigger}
              title={s.bigger}
              className={round}
            >
              <Icon name="plus" className="size-4" />
            </button>
            <span className="sr-only" aria-live="polite">
              {s.sizeNow(s.sizes[size.id])}
            </span>
          </span>
        ) : null}
      </div>

      {noVoice ? (
        <p role="status" className="mt-2 text-sm font-semibold text-accent-strong">
          {s.noVoice}
        </p>
      ) : null}
      <p className="mt-3 border-t border-line pt-2 text-sm text-muted">
        <span className="font-semibold text-ink">{s.disclaimer}</span>
        {speaks && voiceOn ? ` ${s.voiceNote}` : null}
      </p>
    </section>
  );
}
