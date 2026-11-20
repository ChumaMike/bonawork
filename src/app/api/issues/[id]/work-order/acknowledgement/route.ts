import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { acknowledgeOrder } from "@/server/procurement/orders";
import { loadMoneyTrail } from "@/server/procurement/view";
import { begin, deps } from "@/server/request";

/**
 * `POST /api/issues/:id/work-order/acknowledgement` — the supplier the order
 * names acknowledges it. No body. Returns the `MoneyTrail`.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "order:acknowledge");
  const reportId = await acknowledgeOrder(deps(scope.ctx), {
    reportIdOrReference: id,
    actor: session.actor,
  });
  return ok(await loadMoneyTrail(scope.ctx, reportId, session.actor));
});
