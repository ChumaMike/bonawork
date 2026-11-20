import type {
  GoodsReceipt,
  Invoice,
  MatchOutcome,
  MatchReason,
  WorkOrder,
} from "./types";

/** Written into every `MatchResultDocument`, so a result names the rules that produced it. */
export const MATCH_ENGINE_VERSION = "1";

export interface MatchInput {
  /** The order at its current version. */
  order: Pick<
    WorkOrder,
    "version" | "acknowledgedVersion" | "supplierRef" | "lines" | "totalCents"
  >;
  /** The invoice being checked. */
  invoice: Pick<
    Invoice,
    "invoiceNumber" | "orderVersion" | "supplierRef" | "lines" | "totalCents"
  >;
  /** Invoice numbers of the earlier invoices on this order. */
  priorInvoiceNumbers: readonly string[];
  /** Every goods receipt on this order. Only those for the current version count; their quantities add up. */
  receipts: readonly Pick<GoodsReceipt, "orderVersion" | "lines">[];
}

export interface MatchVerdict {
  outcome: MatchOutcome;
  /** Empty when `matched`. In the stable order of `MATCH_REASON_CODES`, then by `sku`. */
  reasons: MatchReason[];
}

/**
 * The three-way match: order, invoice and goods receipts must agree exactly.
 * Pure and deterministic: the same input always gives the same reasons in the
 * same order. No tolerances. Written by code; AI plays no part in it.
 */
export function matchThreeWay(input: MatchInput): MatchVerdict {
  void input;
  throw new Error("not implemented");
}
