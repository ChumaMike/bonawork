import { getContext } from "@/server/context";
import { ok, route } from "@/server/http";
import { loadBundle } from "@/server/reports/common";
import { toSubmissionReceipt } from "@/server/view";

/** `GET /api/receipts/:reference` — the submission receipt for a tracking reference (or id). */
export const GET = route<{ reference: string }>(async (_request, { reference }) => {
  const ctx = await getContext();
  const bundle = await loadBundle(ctx.db, reference);
  return ok(toSubmissionReceipt(bundle));
});
