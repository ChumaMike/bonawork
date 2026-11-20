import { ApproveWorkOrderInputSchema } from "@/shared";
import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, parseJson, route } from "@/server/http";
import { approveWorkOrder } from "@/server/procurement/orders";
import { loadMoneyTrail } from "@/server/procurement/view";
import { begin, deps } from "@/server/request";

/**
 * `POST /api/issues/:id/work-order` — a buyer approves the work order for a
 * report (`ApproveWorkOrderInput`). Returns the `MoneyTrail`, 201.
 * 409 when the case already has a work order.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "order:approve");
  const order = await parseJson(request, ApproveWorkOrderInputSchema);
  const reportId = await approveWorkOrder(deps(scope.ctx), {
    reportIdOrReference: id,
    actor: session.actor,
    order,
  });
  return ok(await loadMoneyTrail(scope.ctx, reportId, session.actor), 201);
});
