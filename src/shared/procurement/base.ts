import { z } from "zod";

/**
 * Leaf schemas of the procurement trail: the ones the commitment documents in
 * `../domain.ts` are built from. This file imports nothing from `../domain`,
 * so `domain.ts` can import it without a cycle. Everything here is re-exported
 * by `./types`.
 */

/** Money is whole cents. No floats, no rounding. */
export const CentsSchema = z.number().int().nonnegative();

/** The only currency. Amounts never leave the signed-in procurement views. */
export const CURRENCY = "ZAR";
export const CurrencySchema = z.literal(CURRENCY);
export type Currency = z.infer<typeof CurrencySchema>;

/** One line of a work order or an invoice. */
export const OrderLineSchema = z.object({
  /** Identifies the line across the order, the invoice and the goods receipt. */
  sku: z.string().min(1).max(64),
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPriceCents: CentsSchema,
});
export type OrderLine = z.infer<typeof OrderLineSchema>;

/** One line of a goods receipt: what arrived. It carries no price. */
export const ReceiptLineSchema = z.object({
  sku: z.string().min(1).max(64),
  description: z.string().min(1).max(200),
  /** May be zero: the line was ordered and nothing arrived. */
  quantity: z.number().int().nonnegative(),
});
export type ReceiptLine = z.infer<typeof ReceiptLineSchema>;

/**
 * Why an invoice did not match, in the order `matchThreeWay` reports them.
 * Exact match only: there are no tolerances.
 */
export const MATCH_REASON_CODES = [
  /** The invoice names an order version that is no longer the current one. */
  "order_version_changed",
  /** The supplier has not acknowledged the current order version. */
  "order_not_acknowledged",
  /** The supplier reference on the invoice is not the one on the order. */
  "wrong_supplier",
  /** The invoice number was already used on this order. */
  "duplicate_invoice",
  /** No goods receipt exists for the current order version. */
  "missing_receipt",
  /** The invoice has a line the order does not. */
  "unknown_line",
  /** The order has a line the invoice does not. */
  "missing_line",
  /** More was invoiced than was received. */
  "excess_quantity",
  /** The invoiced quantity is not the ordered quantity. */
  "quantity_mismatch",
  /** The invoiced unit price is not the ordered unit price. */
  "unit_price_mismatch",
  /** The stated total is not the sum of the invoice lines, or not the order total. */
  "total_mismatch",
] as const;
export const MatchReasonCodeSchema = z.enum(MATCH_REASON_CODES);
export type MatchReasonCode = z.infer<typeof MatchReasonCodeSchema>;

/**
 * One reason, with the numbers needed to explain it in words.
 *
 * - `sku`: the line the reason is about; null for reasons about the whole invoice.
 * - `expected` / `actual`: what the order or receipt says and what the invoice
 *   says. Versions for `order_version_changed`, quantities for the quantity
 *   codes, cents for `unit_price_mismatch` and `total_mismatch`; null when the
 *   code needs no number.
 *
 * The cents of the two price codes are amounts: `visibility.ts` removes them
 * for roles that may not see prices.
 */
export const MatchReasonSchema = z.object({
  code: MatchReasonCodeSchema,
  sku: z.string().min(1).max(64).nullable(),
  expected: z.number().int().nullable(),
  actual: z.number().int().nullable(),
});
export type MatchReason = z.infer<typeof MatchReasonSchema>;
