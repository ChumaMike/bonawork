import { formatRand, vatInclusiveCents } from "./parse";
import type {
  CandidateOffer,
  PriceCheckLine,
  PriceCheckLineResult,
  PriceLevel,
} from "./types";

/**
 * Pure comparison of one invoice line with the shop prices found for it. The
 * same inputs always give the same result. It warns; it never decides.
 */

/** Up to this many percent above the median is `ok`. */
export const CHECK_ABOVE_PERCENT = 25;
/** More than this many percent above the median is `high`. */
export const HIGH_ABOVE_PERCENT = 75;

/** Median of whole cents. With an even count, the mean of the middle two, rounded half up. */
export function medianCents(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Whole percent `price` is above `median`, rounded half away from zero. */
export function percentAbove(priceCents: number, median: number): number {
  const exact = ((priceCents - median) * 100) / median;
  return Math.sign(exact) * Math.round(Math.abs(exact));
}

/**
 * The level from exact integer comparison (no rounding at the boundaries):
 * exactly 25% above is `ok`, exactly 75% above is `check`.
 */
export function levelFor(
  priceCents: number,
  median: number,
): Exclude<PriceLevel, "unavailable"> {
  const over = (priceCents - median) * 100;
  if (over <= CHECK_ABOVE_PERCENT * median) return "ok";
  if (over <= HIGH_ABOVE_PERCENT * median) return "check";
  return "high";
}

const shops = (n: number) => (n === 1 ? "1 shop price" : `${n} shop prices`);

export function compareLine(
  line: Pick<PriceCheckLine, "lineId" | "unitPriceCents" | "vatInclusive">,
  candidates: readonly CandidateOffer[],
): PriceCheckLineResult {
  const offers = [...candidates]
    .sort(
      (a, b) =>
        a.priceCents - b.priceCents || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
    )
    .map(({ retailer, url, title, priceCents }) => ({
      retailer,
      url,
      title,
      priceCents,
    }));
  const median = medianCents(offers.map((o) => o.priceCents));
  if (median === null || median === 0) {
    return {
      lineId: line.lineId,
      level: "unavailable",
      medianCents: null,
      percentAbove: null,
      offers: [],
      note: "No comparable shop price was found, so this line was not compared.",
    };
  }

  const price = vatInclusiveCents(line.unitPriceCents, line.vatInclusive);
  const pct = percentAbove(price, median);
  const level = levelFor(price, median);
  const priceText = `${formatRand(price)}${line.vatInclusive ? "" : " (with 15% VAT added)"}`;
  const against = `the median of ${shops(offers.length)} (${formatRand(median)})`;

  let note: string;
  if (level === "high") {
    note = `${priceText} is ${pct}% above ${against}. Ask for a cost breakdown.`;
  } else if (level === "check") {
    note = `${priceText} is ${pct}% above ${against}. Delivery, labour or a different spec may explain it; ask if unsure.`;
  } else if (pct > 0) {
    note = `${priceText} is ${pct}% above ${against}, within the usual range.`;
  } else if (pct < 0) {
    note = `${priceText} is ${-pct}% below ${against}.`;
  } else {
    note = `${priceText} is about the same as ${against}.`;
  }

  return {
    lineId: line.lineId,
    level,
    medianCents: median,
    percentAbove: pct,
    offers,
    note,
  };
}

const RANK: Record<PriceLevel, number> = { unavailable: 0, ok: 1, check: 2, high: 3 };

/** The worst level among the lines; `unavailable` when no line was compared. */
export function overallLevel(levels: readonly PriceLevel[]): PriceLevel {
  return levels.reduce<PriceLevel>(
    (worst, l) => (RANK[l] > RANK[worst] ? l : worst),
    "unavailable",
  );
}
