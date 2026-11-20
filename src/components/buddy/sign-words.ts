/*
 * Sign language concept preview: picking words on the page and choosing a
 * gesture for each. Ported from the Gcina project (sasl-preview.tsx).
 *
 * The gestures are NOT sign language. Each word gets a made-up hand shape and
 * movement, seeded from its letters so the same word always looks the same.
 * Real South African Sign Language needs a Deaf-community partner.
 */

/** Sentence-sized pieces of a page. `data-bona-sign` opts any other element in. */
const BLOCKS =
  "h1,h2,h3,h4,h5,h6,p,li,td,th,label,button,a,dt,dd,figcaption,legend,summary,[role=button],[data-bona-sign]";
/** Never read: the preview's own panel, code, controls with typed text, hidden decoration. */
const SKIP =
  "[data-bona-sign-ignore],script,style,svg,canvas,input,textarea,select,[aria-hidden=true]";
const MAX_WORDS = 28;
const HIGHLIGHT = "bona-sign-word";

export type PageWord = { text: string; node: Text; start: number; end: number };

function hasOwnText(el: Element) {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) return true;
  }
  return false;
}

/**
 * The sentence-sized element under the pointer: a heading, paragraph, button
 * or link if there is one, else the nearest element with text of its own.
 */
export function pickTarget(from: Element): Element | null {
  if (from.closest(SKIP)) return null;
  const block = from.closest(BLOCKS);
  if (block) return block;
  for (
    let el: Element | null = from, depth = 0;
    el && el !== document.body && depth < 4;
    el = el.parentElement, depth++
  ) {
    if (hasOwnText(el)) return el;
  }
  return null;
}

/** The first words of an element, each with where it sits in the page's text. */
export function wordsIn(el: Element): PageWord[] {
  const out: PageWord[] = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(SKIP)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (
    let node = walker.nextNode() as Text | null;
    node && out.length < MAX_WORDS;
    node = walker.nextNode() as Text | null
  ) {
    const pattern = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(node.data)) && out.length < MAX_WORDS) {
      out.push({
        text: match[0],
        node,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  return out;
}

const canHighlight = () =>
  typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

/** Lights up one word in the page itself (CSS Custom Highlight API: no DOM changes). */
export function markWord(word: PageWord | undefined) {
  if (!canHighlight()) return;
  if (!word || !word.node.isConnected || word.end > word.node.length) {
    CSS.highlights.delete(HIGHLIGHT);
    return;
  }
  const range = new Range();
  range.setStart(word.node, word.start);
  range.setEnd(word.node, word.end);
  CSS.highlights.set(HIGHLIGHT, new Highlight(range));
}

/** How long a word is shown for. Numbers are spelled out (slower); punctuation adds a pause. */
export function wordMs(word: string): number {
  const core = /\d/.test(word)
    ? 320 + 110 * Math.min(word.length, 7)
    : 380 + 32 * Math.min(word.length, 12);
  return core + (/[.,!?;:]$/.test(word) ? 220 : 0);
}

/* ------------------------------------------------------------------------ */
/* Made-up but consistent gestures                                           */
/* ------------------------------------------------------------------------ */

/** Joint angles for one arm, and how far each finger (and the thumb) is curled. */
export type ArmPose = {
  sx: number;
  sz: number;
  ex: number;
  ez: number;
  wy: number;
  curl: number[];
};
export type Pose = {
  r: ArmPose;
  l: ArmPose;
  two: boolean;
  move: number;
  brow: number;
  spell: boolean;
};

// Finger curls (index, middle, ring, little) + thumb: open, fist, point, V, Y, C, flat O.
const SHAPES = [
  [0, 0, 0, 0, 0.2],
  [1, 1, 1, 1, 0.1],
  [0, 1, 1, 1, 0.9],
  [0, 0, 1, 1, 0.9],
  [1, 1, 1, 0, 0],
  [0.5, 0.5, 0.5, 0.5, 0.5],
  [0.8, 0.8, 0.8, 0.8, 0.7],
];
export const REST: ArmPose = {
  sx: 0.05,
  sz: 0.1,
  ex: -0.25,
  ez: 0,
  wy: 0,
  curl: [0.3, 0.35, 0.4, 0.4, 0.3],
};
const WEAK: ArmPose = {
  sx: -0.35,
  sz: 0.1,
  ex: -1.0,
  ez: 0,
  wy: 0.3,
  curl: [0.4, 0.4, 0.4, 0.4, 0.4],
};
export const WAVE: ArmPose = {
  sx: -0.2,
  sz: 2.4,
  ex: 0,
  ez: 0,
  wy: 0,
  curl: [0, 0, 0, 0, 0.2],
};

/** A small seeded random source: the same word always gives the same numbers. */
function rng(word: string) {
  let h = 2166136261;
  for (const c of word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")) {
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const poses = new Map<string, Pose>();

/** The placeholder gesture for a word. Not a sign: see the note at the top of this file. */
export function poseFor(word: string): Pose {
  const hit = poses.get(word);
  if (hit) return hit;
  const r = rng(word);
  const spell = /\d/.test(word);
  const two = !spell && r() < 0.45;
  const shape = SHAPES[Math.floor(r() * SHAPES.length)];
  const dom: ArmPose = spell
    ? { sx: -1.25, sz: 0.25, ex: -1.2, ez: 0, wy: 0, curl: [0, 1, 1, 1, 0.9] }
    : {
        sx: -0.7 - r() * 0.8,
        sz: -0.4 + r() * 0.65,
        ex: -0.4 - r() * 1.2,
        ez: 0,
        wy: (r() - 0.5) * 1.4,
        curl: shape,
      };
  const weak = two
    ? { ...dom, curl: r() < 0.6 ? shape : SHAPES[Math.floor(r() * SHAPES.length)] }
    : WEAK;
  const pose: Pose = {
    r: dom,
    l: weak,
    two,
    move: r(),
    brow: word.endsWith("?") ? 1 : 0,
    spell,
  };
  poses.set(word, pose);
  return pose;
}
