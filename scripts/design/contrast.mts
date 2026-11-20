/**
 * Checks every text/background pair the design language allows against
 * WCAG 2.2 AA (4.5:1 for text, 3:1 for large text and UI parts), in both
 * light and dark mode. Reads the tokens straight from src/app/globals.css so
 * the check cannot drift from the real values.
 *
 *   node scripts/design/contrast.mts          # prints a table, exits 1 on failure
 *   node scripts/design/contrast.mts --md     # prints the Markdown table for the docs
 *
 * Runs on Node 22.6+ (type stripping); no build step.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Tokens = Record<string, string>;

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "../../src/app/globals.css"), "utf8");

/** Collects `--color-*: #hex;` lines inside a block that starts at `marker`. */
function tokensAfter(marker: string): Tokens {
  const start = css.indexOf(marker);
  if (start < 0) throw new Error(`Could not find ${marker} in globals.css`);
  const end = css.indexOf("\n}\n", start);
  const block = css.slice(start, end);
  const tokens: Tokens = {};
  for (const match of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) {
    tokens[match[1]] = match[2].toLowerCase();
  }
  return tokens;
}

const light = tokensAfter("@theme {");
const darkOverrides = tokensAfter(':root:not([data-theme="light"])');
const dark: Tokens = { ...light, ...darkOverrides };

function luminance(hex: string): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** [text token, background token, minimum ratio, what it is used for] */
type Pair = [string, string, number, string];

const TEXT = 4.5;
const LARGE = 3;

const pairs: Pair[] = [
  // Reading text on the three paper surfaces
  ["ink", "canvas", TEXT, "body text on the page"],
  ["ink", "surface", TEXT, "body text on a card"],
  ["ink", "sunken", TEXT, "body text on a sunken panel"],
  ["muted", "canvas", TEXT, "secondary text on the page"],
  ["muted", "surface", TEXT, "secondary text on a card"],
  ["muted", "sunken", TEXT, "secondary text on a sunken panel"],
  ["faint", "surface", TEXT, "placeholder and timestamps"],
  ["line-strong", "surface", LARGE, "input borders and dividers"],

  // Brand, earth, accent, danger as text and as fills
  ["brand", "canvas", TEXT, "brand text on the page"],
  ["brand-strong", "surface", TEXT, "links and quiet buttons"],
  ["brand-strong", "brand-soft", TEXT, "text inside a brand-soft chip"],
  ["on-brand", "brand", TEXT, "primary button label"],
  ["on-brand", "brand-strong", TEXT, "primary button label, hovered"],
  ["earth", "surface", TEXT, "earth text on a card"],
  ["earth-strong", "earth-soft", TEXT, "role badge"],
  ["on-brand", "earth", TEXT, "label on an earth fill (avatar)"],
  ["accent", "surface", TEXT, "accent text on a card"],
  ["accent-strong", "accent-soft", TEXT, "text inside an accent-soft chip"],
  ["on-brand", "accent", TEXT, "label on an accent fill (avatar)"],
  ["danger", "surface", TEXT, "error text"],
  ["danger", "danger-soft", TEXT, "text inside a danger alert"],
  ["on-brand", "danger", TEXT, "danger button label"],
  ["ink", "sun-soft", TEXT, "empty-state text on the sunlight tint"],
  ["muted", "sun-soft", TEXT, "empty-state secondary text"],
  ["canvas", "ink", TEXT, "preview banner"],

  // Status pills: text on its soft tint, and the strong colour as a bar on paper
  ["st-reported", "st-reported-soft", TEXT, "status pill: reported"],
  ["st-assess", "st-assess-soft", TEXT, "status pill: under assessment"],
  ["st-address", "st-address-soft", TEXT, "status pill: being addressed"],
  ["st-claimed", "st-claimed-soft", TEXT, "status pill: repair claimed"],
  ["st-verified", "st-verified-soft", TEXT, "status pill: independently verified"],
  ["st-disputed", "st-disputed-soft", TEXT, "status pill: disputed"],
  ["st-declined", "st-declined-soft", TEXT, "status pill: declined"],
  ["st-reported", "surface", TEXT, "status text on a card: reported"],
  ["st-assess", "surface", TEXT, "status text on a card: under assessment"],
  ["st-address", "surface", TEXT, "status text on a card: being addressed"],
  ["st-claimed", "surface", TEXT, "status text on a card: repair claimed"],
  ["st-verified", "surface", TEXT, "status text on a card: verified"],
  ["st-disputed", "surface", TEXT, "status text on a card: disputed"],
  ["st-declined", "surface", TEXT, "status text on a card: declined"],

  // Focus ring against the surfaces it sits on
  ["brand", "surface", LARGE, "focus ring on a card"],
  ["brand", "canvas", LARGE, "focus ring on the page"],
];

type Row = { mode: "light" | "dark"; pair: Pair; ratio: number; ok: boolean };

const rows: Row[] = [];
for (const [mode, tokens] of [
  ["light", light],
  ["dark", dark],
] as const) {
  for (const pair of pairs) {
    const [fg, bg, min] = pair;
    if (!tokens[fg] || !tokens[bg]) throw new Error(`Unknown token ${fg} or ${bg}`);
    const ratio = contrast(tokens[fg], tokens[bg]);
    rows.push({ mode, pair, ratio, ok: ratio >= min });
  }
}

const markdown = process.argv.includes("--md");
if (markdown) {
  console.log("| Mode | Text | Background | Ratio | Needs | Used for |");
  console.log("| --- | --- | --- | ---: | ---: | --- |");
  for (const row of rows) {
    const [fg, bg, min, use] = row.pair;
    console.log(
      `| ${row.mode} | \`${fg}\` | \`${bg}\` | ${row.ratio.toFixed(2)}${row.ok ? "" : " ✗"} | ${min} | ${use} |`,
    );
  }
} else {
  for (const row of rows) {
    const [fg, bg, min, use] = row.pair;
    const mark = row.ok ? "ok  " : "FAIL";
    console.log(
      `${mark} ${row.mode.padEnd(5)} ${row.ratio.toFixed(2).padStart(5)} ≥ ${min}  ${fg} on ${bg}  (${use})`,
    );
  }
}

const failures = rows.filter((row) => !row.ok);
console.error(
  `\n${rows.length - failures.length}/${rows.length} pairs pass${failures.length ? `; ${failures.length} FAIL` : ""}`,
);
if (failures.length) process.exit(1);
