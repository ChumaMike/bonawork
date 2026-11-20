import type { MatchReason } from "./types";

/** What `ruleExplanation` says when there is nothing to explain. */
export const MATCHED_EXPLANATION = "It agrees with the order and the delivery.";

/**
 * The code-written plain-language explanation of why an invoice was blocked:
 * the sentence of each reason, in the order given. This is the text shown when
 * AI is off, and the facts any AI rewording must stick to.
 */
export function ruleExplanation(reasons: readonly MatchReason[]): string {
  if (reasons.length === 0) return MATCHED_EXPLANATION;
  return reasons.map((reason) => reasonSentence(reason)).join(" ");
}

/** Whole cents as rand, the way a South African invoice prints it: `R4 200,00`. */
export function formatRand(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("formatRand: cents must be a whole number");
  }
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const rands = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = (absolute % 100).toString().padStart(2, "0");
  return `${sign}R${rands},${fraction}`;
}

/**
 * The sentence for one reason: the wording of the reason table in
 * docs/design/BONA_CHAIN_SCREENS.md ("The blocked-invoice result"). The rule
 * list on screen and `ruleExplanation` both come from here, so they cannot
 * disagree. `amount` formats cents; it defaults to `formatRand`.
 *
 * A price reason whose numbers were removed (a viewer who may not see prices)
 * gets the "without prices" wording, which states no amount.
 */
export function reasonSentence(
  reason: MatchReason,
  amount: (cents: number) => string = formatRand,
): string {
  const { code, expected, actual } = reason;
  const line = reason.sku ?? "A line";
  const numbers = expected !== null && actual !== null;
  switch (code) {
    case "order_version_changed":
      return numbers
        ? `The invoice is for version ${actual} of the order. The order is now version ${expected}.`
        : "The invoice is for a version of the order that is no longer the current one.";
    case "order_not_acknowledged":
      return "The order has not been acknowledged yet.";
    case "wrong_supplier":
      return "The supplier reference on the invoice is not the one on the order.";
    case "duplicate_invoice":
      return "This invoice number was already used on this order.";
    case "missing_receipt":
      return "No delivery has been recorded for this order yet.";
    case "unknown_line":
      return `${line}: this line is on the invoice but not on the order.`;
    case "missing_line":
      return `${line}: this line is on the order but not on the invoice.`;
    case "excess_quantity":
      return numbers
        ? `${line}: ${actual} invoiced, but only ${expected} arrived.`
        : `${line}: more was invoiced than arrived.`;
    case "quantity_mismatch":
      return numbers
        ? `${line}: ${actual} invoiced, ${expected} ordered.`
        : `${line}: the quantity invoiced is not the quantity ordered.`;
    case "unit_price_mismatch":
      return numbers
        ? `${line}: the unit price is ${amount(actual)}. The order says ${amount(expected)}.`
        : `${line}: the unit price is not the one on the order.`;
    case "total_mismatch":
      // The engine also raises this when the stated total is not the sum of the
      // invoice's own lines, so the wording does not claim it is the order total.
      return numbers
        ? `The invoice total is ${amount(actual)}. It should be ${amount(expected)}.`
        : "The invoice total is not the amount it should be.";
  }
}
