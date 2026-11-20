/**
 * Money on the procurement screens. Amounts travel as whole cents and are
 * only ever shown as rand. Nothing here rounds: a value that is not a clean
 * rand-and-cents amount is refused, never adjusted.
 */

/** The one money formatter, shared with the rule explanations: `R5 885,00` from 588500. */
export { formatRand } from "@/shared";

/**
 * Cents from what a person typed or an invoice says: `R5 885,00`,
 * `R 1 250.00`, `1250`, `1,250.50`. Null when the text is not a rand amount.
 */
export function parseRand(text: string): number | null {
  let value = text
    .trim()
    .replace(/^(zar|r)\s*/i, "")
    .replace(/[\s ]/g, "");
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(value)) value = value.replace(/,/g, "");
  else if (/^\d+,\d{1,2}$/.test(value)) value = value.replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** A whole number of at least `min` from typed text; null otherwise. */
export function parseQuantity(text: string, min = 0): number | null {
  const value = text.trim();
  if (!/^\d+$/.test(value)) return null;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) && quantity >= min ? quantity : null;
}

/** Sum of `quantity * unitPriceCents` over the lines. */
export function linesTotal(
  lines: readonly { quantity: number; unitPriceCents: number }[],
): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
}
