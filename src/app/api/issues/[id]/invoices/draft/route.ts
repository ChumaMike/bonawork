import { z } from "zod";
import { MAX_INVOICE_TEXT } from "@/server/ai/guard";
import { draftInvoice } from "@/server/ai/invoice-draft";
import { aiDeps } from "@/server/ai/provider";
import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, parseJson, route } from "@/server/http";
import { requireReport } from "@/server/reports/common";
import { begin } from "@/server/request";

const Body = z.strictObject({
  text: z
    .string()
    .trim()
    .min(1, "Paste the invoice text.")
    .max(
      MAX_INVOICE_TEXT,
      `Paste at most ${MAX_INVOICE_TEXT} characters of invoice text.`,
    ),
});

/**
 * `POST /api/issues/:id/invoices/draft`: Bona AI reads pasted invoice text
 * into fields for the supplier to check. Needs `invoice:submit`.
 *
 * It writes nothing: no database row, no ledger call, no case event. The
 * draft is returned and forgotten; only `POST /api/issues/:id/invoices`,
 * sent by the supplier after checking, records an invoice.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  requirePermission(requireSession(scope.session), "invoice:submit");
  const body = await parseJson(request, Body);
  // The case must exist. The draft itself reads nothing from it.
  await requireReport(scope.ctx.db, id);
  return ok(await draftInvoice(aiDeps(scope.ctx.env), { text: body.text }));
});
