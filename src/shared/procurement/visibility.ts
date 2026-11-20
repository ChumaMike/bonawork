import type { UserRole } from "../roles";
import type { MoneyTrail } from "./types";

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
  void trail;
  void visibility;
  throw new Error("not implemented");
}
