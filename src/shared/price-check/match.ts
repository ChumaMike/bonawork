/**
 * Does a shop listing describe the same item as an invoice line? Plain keyword
 * overlap, deterministic. A model could judge this better later: it would
 * implement `ItemMatcher` and be passed in, and `keywordMatcher` stays the
 * default and the fallback. No model is called here.
 */

export interface ItemMatchVerdict {
  matches: boolean;
  /** Share of the line's keywords found in the listing, 0..1. */
  score: number;
  /** Sizes on the invoice line (e.g. `110mm`) that the listing does not mention. */
  missingUnits: string[];
}

/** The seam for a later, smarter matcher. */
export interface ItemMatcher {
  match(lineDescription: string, listingTitle: string): ItemMatchVerdict;
}

/** At least this share of the line's keywords must appear in the listing. */
export const MIN_KEYWORD_SCORE = 0.5;

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "for",
  "with",
  "to",
  "in",
  "on",
  "at",
  "by",
  "or",
  "x",
  "each",
  "ea",
  "per",
  "unit",
  "units",
  "pc",
  "pcs",
  "piece",
  "pieces",
  "item",
  "supply",
  "supplied",
  "install",
  "installed",
  "installation",
  "new",
  "replace",
  "replacement",
  "complete",
  "set",
  "type",
  "std",
  "standard",
  "incl",
  "including",
  "excl",
  "vat",
  "qty",
]);

const UNIT_ALIASES: Record<string, string> = {
  mm: "mm",
  cm: "cm",
  m: "m",
  l: "l",
  lt: "l",
  ltr: "l",
  litre: "l",
  litres: "l",
  liter: "l",
  liters: "l",
  kg: "kg",
  g: "g",
  w: "w",
  v: "v",
};

/** Join "110 mm" to "110mm", "1,5 m" to "1.5m", "9 litre" to "9l". */
function normaliseUnits(text: string): string {
  return text.replace(
    /(\d+(?:[.,]\d+)?)\s*(mm|cm|m|ltr|lt|litres?|liters?|l|kg|g|w|v)\b/gi,
    (_, n: string, u: string) => `${n.replace(",", ".")}${UNIT_ALIASES[u.toLowerCase()]}`,
  );
}

const UNIT_TOKEN = /^\d+(?:\.\d+)?(mm|cm|m|l|kg|g|w|v)$/;

/** Lower-case words and sizes, stop words and lone numbers removed, in order, no repeats. */
export function keywords(text: string): string[] {
  const tokens = normaliseUnits(text.normalize("NFKC").toLowerCase())
    .split(/[^a-z0-9.]+/)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t))
    .filter((t) => UNIT_TOKEN.test(t) || !/^\d+(\.\d+)?$/.test(t))
    .filter((t) => UNIT_TOKEN.test(t) || t.length > 1);
  return [...new Set(tokens)];
}

export function isUnitToken(token: string): boolean {
  return UNIT_TOKEN.test(token);
}

/** Plural "pipes" matches "pipe". */
const stem = (t: string) =>
  t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;

export const keywordMatcher: ItemMatcher = {
  match(lineDescription, listingTitle) {
    const line = keywords(lineDescription);
    const listing = new Set(keywords(listingTitle).map(stem));
    const units = line.filter(isUnitToken);
    const words = line.filter((t) => !isUnitToken(t));
    const missingUnits = units.filter((u) => !listing.has(u));
    const hits = words.filter((w) => listing.has(stem(w))).length;
    const score = words.length === 0 ? 0 : hits / words.length;
    return {
      matches: missingUnits.length === 0 && score >= MIN_KEYWORD_SCORE,
      score,
      missingUnits,
    };
  },
};

/** The search words for a line: its keywords, sizes kept, at most eight. */
export function searchQuery(lineDescription: string): string {
  return keywords(lineDescription).slice(0, 8).join(" ");
}
