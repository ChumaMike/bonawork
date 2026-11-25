import { requirePermission, requireSession } from "@/server/auth/session";
import {
  ConfirmBudgetSchema,
  confirmRepairBudget,
  loadRepairBudget,
} from "@/server/escrow";
import { ok, parseJson, route } from "@/server/http";
import { begin } from "@/server/request";

/**
 * `GET /api/issues/:id/budget` — public. The repair budget the school
 * confirmed with Repair Scout (parts, prices, and the 40/60 split), or null.
 */
export const GET = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  return ok(await loadRepairBudget(scope.ctx.db, id), 200, {
    "cache-control": "no-store",
  });
});

/**
 * `POST /api/issues/:id/budget` — the school's own staff (`case:update`).
 * Body `{ lines }`. The split is recomputed by code. It only prefills the
 * funder's escrow terms; nothing is created on chain.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "case:update");
  const body = await parseJson(request, ConfirmBudgetSchema);
  return ok(
    await confirmRepairBudget(scope.ctx.db, {
      reportIdOrReference: id,
      actor: session.actor,
      lines: body.lines,
    }),
    201,
  );
});
