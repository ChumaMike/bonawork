import type {
  GoodsReceipt,
  Invoice,
  MatchOutcome,
  MatchReason,
  MatchReasonCode,
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
 *
 * Every reason is collected; the engine does not stop at the first one.
 * Throws a `RangeError` when any amount, quantity or version is not a whole
 * non-negative number: a fraction of a cent is a bug, never a rounding job.
 */
export function matchThreeWay(input: MatchInput): MatchVerdict {
  const { order, invoice } = input;
  assertWholeNumbers(input);

  const reasons: MatchReason[] = [];
  const add = (
    code: MatchReasonCode,
    sku: string | null = null,
    expected: number | null = null,
    actual: number | null = null,
  ) => reasons.push({ code, sku, expected, actual });

  if (invoice.orderVersion !== order.version) {
    add("order_version_changed", null, order.version, invoice.orderVersion);
  }
  if (order.acknowledgedVersion !== order.version) add("order_not_acknowledged");
  if (invoice.supplierRef.trim() !== order.supplierRef.trim()) add("wrong_supplier");

  const number = normaliseInvoiceNumber(invoice.invoiceNumber);
  if (
    input.priorInvoiceNumbers.some((prior) => normaliseInvoiceNumber(prior) === number)
  ) {
    add("duplicate_invoice");
  }

  const receipts = input.receipts.filter(
    (receipt) => receipt.orderVersion === order.version,
  );
  if (receipts.length === 0) add("missing_receipt");

  const ordered = new Map<string, { quantity: number; unitPriceCents: number }>();
  for (const line of order.lines) {
    const seen = ordered.get(line.sku);
    ordered.set(line.sku, {
      quantity: (seen?.quantity ?? 0) + line.quantity,
      unitPriceCents: seen?.unitPriceCents ?? line.unitPriceCents,
    });
  }
  const invoiced = new Map<string, { quantity: number; prices: number[] }>();
  for (const line of invoice.lines) {
    const seen = invoiced.get(line.sku) ?? { quantity: 0, prices: [] };
    seen.quantity += line.quantity;
    seen.prices.push(line.unitPriceCents);
    invoiced.set(line.sku, seen);
  }
  const received = new Map<string, number>();
  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      received.set(line.sku, (received.get(line.sku) ?? 0) + line.quantity);
    }
  }

  const invoicedSkus = [...invoiced.keys()].sort(bySku);
  const orderedSkus = [...ordered.keys()].sort(bySku);

  for (const sku of invoicedSkus) if (!ordered.has(sku)) add("unknown_line", sku);
  for (const sku of orderedSkus) if (!invoiced.has(sku)) add("missing_line", sku);

  // Lines on both the order and the invoice are compared number by number.
  const shared = invoicedSkus.filter((sku) => ordered.has(sku));
  if (receipts.length > 0) {
    for (const sku of shared) {
      const got = received.get(sku) ?? 0;
      const billed = invoiced.get(sku)!.quantity;
      if (billed > got) add("excess_quantity", sku, got, billed);
    }
  }
  for (const sku of shared) {
    const want = ordered.get(sku)!.quantity;
    const billed = invoiced.get(sku)!.quantity;
    if (billed !== want) add("quantity_mismatch", sku, want, billed);
  }
  for (const sku of shared) {
    const want = ordered.get(sku)!.unitPriceCents;
    const wrong = invoiced.get(sku)!.prices.find((price) => price !== want);
    if (wrong !== undefined) add("unit_price_mismatch", sku, want, wrong);
  }

  // The stated total must be the sum of the invoice's own lines, and the order total.
  const lineSum = invoice.lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPriceCents,
    0,
  );
  if (invoice.totalCents !== lineSum) {
    add("total_mismatch", null, lineSum, invoice.totalCents);
  } else if (invoice.totalCents !== order.totalCents) {
    add("total_mismatch", null, order.totalCents, invoice.totalCents);
  }

  return { outcome: reasons.length === 0 ? "matched" : "blocked", reasons };
}

/** Invoice numbers are the same when they differ only in case or whitespace. */
export function normaliseInvoiceNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Plain code-unit order, so the result does not depend on the machine's locale. */
function bySku(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertWholeNumbers(input: MatchInput): void {
  const check = (value: number, name: string) => {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`matchThreeWay: ${name} must be a whole, non-negative number`);
    }
  };
  check(input.order.version, "order.version");
  check(input.order.totalCents, "order.totalCents");
  check(input.invoice.orderVersion, "invoice.orderVersion");
  check(input.invoice.totalCents, "invoice.totalCents");
  for (const line of input.order.lines) {
    check(line.quantity, "order line quantity");
    check(line.unitPriceCents, "order line unitPriceCents");
  }
  for (const line of input.invoice.lines) {
    check(line.quantity, "invoice line quantity");
    check(line.unitPriceCents, "invoice line unitPriceCents");
  }
  for (const receipt of input.receipts) {
    check(receipt.orderVersion, "receipt.orderVersion");
    for (const line of receipt.lines) check(line.quantity, "receipt line quantity");
  }
}
