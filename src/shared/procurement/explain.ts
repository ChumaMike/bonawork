import type { MatchReason } from "./types";

/** What `ruleExplanation` says when there is nothing to explain. */
export const MATCHED_EXPLANATION =
  "The invoice agrees exactly with the work order and with what was received.";

/**
 * The code-written plain-language explanation of why an invoice was blocked:
 * one sentence per reason, in the order given. This is the text shown when AI
 * is off, and the facts any AI rewording must stick to.
 */
export function ruleExplanation(reasons: readonly MatchReason[]): string {
  if (reasons.length === 0) return MATCHED_EXPLANATION;
  return reasons.map(sentence).join(" ");
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

function units(count: number): string {
  return count === 1 ? "1 unit" : `${count} units`;
}

function item(sku: string | null): string {
  return sku ? `item ${sku}` : "one of the items";
}

/** One sentence per reason. A reason whose numbers were removed still reads as a full sentence. */
function sentence(reason: MatchReason): string {
  const { code, sku, expected, actual } = reason;
  const numbers = expected !== null && actual !== null;
  switch (code) {
    case "order_version_changed":
      return numbers
        ? `The invoice was written against version ${actual} of the work order, but the order is now at version ${expected}.`
        : "The invoice was written against a version of the work order that is no longer the current one.";
    case "order_not_acknowledged":
      return "The supplier has not yet confirmed the current version of the work order.";
    case "wrong_supplier":
      return "The supplier reference on the invoice is not the supplier the work order was given to.";
    case "duplicate_invoice":
      return "This invoice number has already been used on this work order.";
    case "missing_receipt":
      return "Nobody at the school has recorded yet that the goods or work arrived.";
    case "unknown_line":
      return `The invoice charges for ${item(sku)}, which is not on the work order.`;
    case "missing_line":
      return `The work order includes ${item(sku)}, but the invoice leaves it out.`;
    case "excess_quantity":
      return numbers
        ? `The invoice charges for ${units(actual)} of ${item(sku)}, but only ${expected} ${expected === 1 ? "was" : "were"} recorded as received.`
        : `The invoice charges for more of ${item(sku)} than was recorded as received.`;
    case "quantity_mismatch":
      return numbers
        ? `The work order asks for ${units(expected)} of ${item(sku)}, but the invoice charges for ${actual}.`
        : `The invoice does not charge for the quantity of ${item(sku)} that was ordered.`;
    case "unit_price_mismatch":
      return numbers
        ? `The agreed price for ${item(sku)} is ${formatRand(expected)} each, but the invoice charges ${formatRand(actual)} each.`
        : `The price charged for ${item(sku)} is not the price agreed on the work order.`;
    case "total_mismatch":
      return numbers
        ? `The invoice total is ${formatRand(actual)}, but it should come to ${formatRand(expected)}.`
        : "The invoice total is not the amount it should come to.";
  }
}
