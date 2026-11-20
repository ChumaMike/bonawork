import { SubmitInvoiceInputSchema } from "@/shared";
import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, parseJson, route } from "@/server/http";
import { submitInvoice } from "@/server/procurement/invoices";
import { loadMoneyTrail } from "@/server/procurement/view";
import { begin, deps } from "@/server/request";

/**
 * `POST /api/issues/:id/invoices` — the supplier submits an invoice
 * (`SubmitInvoiceInput`). The rule engine checks it in the same transaction;
 * the result is the last invoice's `match` in the returned `MoneyTrail`, 201.
 * A blocked invoice is still a 201: it was recorded, and it was blocked.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "invoice:submit");
  const invoice = await parseJson(request, SubmitInvoiceInputSchema);
  const reportId = await submitInvoice(deps(scope.ctx), {
    reportIdOrReference: id,
    actor: session.actor,
    invoice,
  });
  return ok(await loadMoneyTrail(scope.ctx, reportId, session.actor), 201);
});
