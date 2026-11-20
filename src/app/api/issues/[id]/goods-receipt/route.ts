import { RecordGoodsReceiptInputSchema } from "@/shared";
import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, parseJson, route } from "@/server/http";
import { recordGoodsReceipt } from "@/server/procurement/receipts";
import { loadMoneyTrail } from "@/server/procurement/view";
import { begin, deps } from "@/server/request";

/**
 * `POST /api/issues/:id/goods-receipt` — the receiving officer records what
 * arrived (`RecordGoodsReceiptInput`: quantities, never prices). The match
 * over the latest invoice reruns in the same transaction. Returns the
 * `MoneyTrail`, 201.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "receipt:record");
  const receipt = await parseJson(request, RecordGoodsReceiptInputSchema);
  const reportId = await recordGoodsReceipt(deps(scope.ctx), {
    reportIdOrReference: id,
    actor: session.actor,
    receipt,
  });
  return ok(await loadMoneyTrail(scope.ctx, reportId, session.actor), 201);
});
