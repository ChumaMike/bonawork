/**
 * The repair budget a school confirms with Repair Scout. It only prefills the
 * funder's escrow terms: total, Check 1 (materials, 40%) and Check 2 (the
 * rest). The split is recomputed here by code; the browser's numbers are not
 * trusted.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";

import { computeBudget, SCOUT_MAX_PARTS } from "@/features/agent/contracts";

import type { RepairBudgetLine, RepairBudgetRow } from "../../../database/schema";
import { schema, type Db } from "../db";
import { HttpError } from "../http";
import { requireReport, type Actor } from "../reports/common";
import { checkTerms } from "./cases";

export const BudgetLineSchema = z.object({
  description: z.string().trim().min(1).max(120),
  quantity: z.number().int().min(1).max(50),
  kind: z.enum(["material", "service"]),
  unitPriceCents: z.number().int().min(0).max(100_000_000),
});

export const ConfirmBudgetSchema = z.object({
  lines: z.array(BudgetLineSchema).min(1).max(SCOUT_MAX_PARTS),
});

export type PublicRepairBudget = {
  totalCents: number;
  materialsCents: number;
  completionCents: number;
  lines: RepairBudgetLine[];
  confirmedAt: string;
};

const view = (row: RepairBudgetRow): PublicRepairBudget => ({
  totalCents: row.totalCents,
  materialsCents: row.materialsCents,
  completionCents: row.completionCents,
  lines: row.lines,
  confirmedAt: row.confirmedAt,
});

export async function loadRepairBudget(
  db: Db,
  reportIdOrReference: string,
): Promise<PublicRepairBudget | null> {
  const report = await requireReport(db, reportIdOrReference);
  const [row] = await db
    .select()
    .from(schema.repairBudgets)
    .where(eq(schema.repairBudgets.reportId, report.id))
    .limit(1);
  return row ? view(row) : null;
}

/** The school's own staff confirm the budget for their own case. */
export async function confirmRepairBudget(
  db: Db,
  input: { reportIdOrReference: string; actor: Actor; lines: RepairBudgetLine[] },
): Promise<PublicRepairBudget> {
  const report = await requireReport(db, input.reportIdOrReference);
  if (!input.actor.institutionId || input.actor.institutionId !== report.institutionId) {
    throw new HttpError(
      "forbidden",
      "Only this school's staff can confirm its repair budget.",
    );
  }
  const budget = computeBudget(input.lines);
  checkTerms({
    amounts: [BigInt(budget.materialsCents), BigInt(budget.completionCents)],
    challengeSeconds: 60,
  });
  const row: RepairBudgetRow = {
    reportId: report.id,
    totalCents: budget.totalCents,
    materialsCents: budget.materialsCents,
    completionCents: budget.completionCents,
    lines: input.lines,
    confirmedBy: input.actor.id,
    confirmedAt: new Date().toISOString(),
  };
  await db
    .insert(schema.repairBudgets)
    .values(row)
    .onConflictDoUpdate({ target: schema.repairBudgets.reportId, set: row });
  return view(row);
}
