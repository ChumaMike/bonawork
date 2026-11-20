import type { UserRole } from "../roles";
import type { MatchReason, MatchReasonCode, MoneyTrail, TrailLine } from "./types";

/**
 * How much of a case's procurement trail a signed-in role may see:
 *
 * - `full`: everything, with the named person per step.
 * - `own_orders`: only orders bound to this supplier, with its own prices.
 * - `no_prices`: names, scope and quantities; no prices or totals.
 * - `none`: nothing. The public trail (`PublicTrailStep`) is all there is.
 */
export const PROCUREMENT_VISIBILITIES = [
  "full",
  "own_orders",
  "no_prices",
  "none",
] as const;
export type ProcurementVisibility = (typeof PROCUREMENT_VISIBILITIES)[number];

/** The field matrix, by role. Signed-out visitors are `none`. */
export const PROCUREMENT_VISIBILITY: Record<UserRole, ProcurementVisibility> = {
  buyer: "full",
  payment_approver: "full",
  district_official: "full",
  supplier: "own_orders",
  receiving_officer: "no_prices",
  school_admin: "no_prices",
  independent_reviewer: "no_prices",
  reporter: "none",
};

export function visibilityFor(role: UserRole | null): ProcurementVisibility {
  return role ? PROCUREMENT_VISIBILITY[role] : "none";
}

/**
 * The trail as a viewer with this visibility may see it. `full` and
 * `own_orders` get it unchanged (the caller has already checked that a
 * supplier owns the order). `no_prices` loses every unit price and total and
 * the numbers of the price reasons, and `pricesVisible` becomes false.
 * `none` is null.
 */
export function redactMoneyTrail(
  trail: MoneyTrail,
  visibility: ProcurementVisibility,
): MoneyTrail | null {
  if (visibility === "none") return null;
  if (visibility === "full" || visibility === "own_orders") return trail;
  return {
    ...trail,
    pricesVisible: false,
    order: {
      id: trail.order.id,
      version: trail.order.version,
      description: trail.order.description,
      supplierName: trail.order.supplierName,
      supplierRef: trail.order.supplierRef,
      lines: trail.order.lines.map(withoutPrice),
      currency: trail.order.currency,
      approvedAt: trail.order.approvedAt,
      acknowledged: trail.order.acknowledged,
      acknowledgedAt: trail.order.acknowledgedAt,
    },
    invoices: trail.invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderVersion: invoice.orderVersion,
      lines: invoice.lines.map(withoutPrice),
      aiDrafted: invoice.aiDrafted,
      submittedAt: invoice.submittedAt,
      match: invoice.match
        ? { ...invoice.match, reasons: redactReasons(invoice.match.reasons) }
        : null,
    })),
  };
}

/** The reason codes whose `expected` and `actual` are amounts in cents. */
export const PRICE_REASON_CODES: readonly MatchReasonCode[] = [
  "unit_price_mismatch",
  "total_mismatch",
];

/** Price reasons keep their code and line, and lose their numbers. */
export function redactReasons(reasons: readonly MatchReason[]): MatchReason[] {
  return reasons.map((reason) =>
    PRICE_REASON_CODES.includes(reason.code)
      ? { code: reason.code, sku: reason.sku, expected: null, actual: null }
      : { ...reason },
  );
}

/** Rebuilt field by field, so a price can never ride along on a spread. */
function withoutPrice(line: TrailLine): TrailLine {
  return { sku: line.sku, description: line.description, quantity: line.quantity };
}
