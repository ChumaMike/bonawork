/**
 * Reading rand prices out of shop page text. Page text is untrusted: this code
 * only looks for amounts, so words on the page ("ignore previous instructions")
 * can change nothing but which amounts appear.
 */

/** Below this a shop price is not believable for a repair part (R5.00). */
export const MIN_PLAUSIBLE_CENTS = 500;
/** Above this it is not a single repair part (R500 000.00). */
export const MAX_PLAUSIBLE_CENTS = 50_000_000;

/** South African VAT, in percent. Shop prices include it. */
export const VAT_PERCENT = 15;

export type PriceContext = "plain" | "now" | "from" | "was" | "save";

export interface FoundPrice {
  cents: number;
  context: PriceContext;
}

/*
 * R, optional space, then either digits grouped in threes (space, no-break
 * space, comma or dot between groups) or plain digits, then optional two
 * decimals after a comma or dot. A letter straight after the amount
 * ("R899 100mm" must not read as R899 100) makes that reading invalid.
 */
const PRICE_RE =
  /(?<![A-Za-z])R\s?(\d{1,3}(?:[   ,.]\d{3})+|\d+)(?:[.,](\d{2}))?(?![\d])(?![A-Za-z])/g;

function toCents(whole: string, decimals: string | undefined): number | null {
  const digits = whole.replace(/[^\d]/g, "");
  if (digits.length === 0 || digits.length > 9) return null;
  const cents = Number(digits) * 100 + (decimals ? Number(decimals) : 0);
  return Number.isSafeInteger(cents) ? cents : null;
}

function contextOf(before: string, after: string): PriceContext {
  const b = before.toLowerCase();
  if (/\b(was|rrp|usual(ly)?|before)\s*:?\s*$/.test(b)) return "was";
  if (/\b(save|saving|you save)\s*:?\s*$/.test(b) || /^\s*off\b/i.test(after))
    return "save";
  if (/\bnow\s*:?\s*(only\s*)?$/.test(b)) return "now";
  if (/\bfrom\s*:?\s*$/.test(b)) return "from";
  return "plain";
}

/** Every rand amount in the text, in order, with the word in front of it. */
export function extractPrices(text: string): FoundPrice[] {
  const found: FoundPrice[] = [];
  for (const m of text.matchAll(PRICE_RE)) {
    const cents = toCents(m[1]!, m[2]);
    if (cents === null) continue;
    const start = m.index ?? 0;
    const before = text.slice(Math.max(0, start - 16), start);
    const after = text.slice(start + m[0].length, start + m[0].length + 6);
    found.push({ cents, context: contextOf(before, after) });
  }
  return found;
}

export function isPlausiblePrice(cents: number): boolean {
  return (
    Number.isInteger(cents) &&
    cents >= MIN_PLAUSIBLE_CENTS &&
    cents <= MAX_PLAUSIBLE_CENTS
  );
}

/** One amount such as "R 1 299,00", "R1,299.00", "From R899". Null when unreadable. */
export function parseRandPrice(text: string): number | null {
  const [first] = extractPrices(text);
  return first ? first.cents : null;
}

/**
 * The price a shop page is selling at: a "Now" price when there is one,
 * otherwise the first plausible amount that is not a "Was" or "Save" amount.
 * Implausible amounts (R0.00 carts, R1 bait) are skipped. Null when none.
 */
export function pickListedPrice(text: string): number | null {
  const prices = extractPrices(text).filter((p) => isPlausiblePrice(p.cents));
  const now = prices.find((p) => p.context === "now");
  if (now) return now.cents;
  const listed = prices.find((p) => p.context !== "was" && p.context !== "save");
  return listed ? listed.cents : null;
}

/** Cents with VAT added, rounded half up to the cent. */
export function addVat(cents: number): number {
  return Math.round((cents * (100 + VAT_PERCENT)) / 100);
}

/** The unit price as a shop would show it: VAT included. */
export function vatInclusiveCents(unitPriceCents: number, vatInclusive: boolean): number {
  return vatInclusive ? unitPriceCents : addVat(unitPriceCents);
}

/** "R1 850.00": space between thousands, dot before cents. */
export function formatRand(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}R${whole}.${String(abs % 100).padStart(2, "0")}`;
}
