import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { loadMoneyTrail } from "@/server/procurement/view";
import { begin } from "@/server/request";

/**
 * `GET /api/issues/:id/procurement` — the procurement trail of one case
 * (`MoneyTrail`), filtered for the caller by the visibility matrix.
 *
 * 401 signed out · 403 a role without `procurement:read`, another supplier's
 * order or another institution's case · 404 an unknown report or a case with
 * no work order.
 */
export const GET = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "procurement:read");
  return ok(await loadMoneyTrail(scope.ctx, id, session.actor));
});
