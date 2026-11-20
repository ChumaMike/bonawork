import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { checkUploads } from "@/server/evidence/validate";
import { parseForm, route } from "@/server/http";
import { submitRepairClaim } from "@/server/reports/admin";
import { begin, deps, issueResponse } from "@/server/request";

const Fields = z.object({ note: z.string().trim().min(1).max(5000) });

/** `POST /api/issues/:id/repair-claim` — multipart `note` + `evidence` (0..n); → repair_claimed. */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requireSession(scope.session);
  const { fields, files } = await parseForm(request, Fields);
  const uploads = await checkUploads(files);
  const reportId = await submitRepairClaim(deps(scope.ctx), {
    reportIdOrReference: id,
    actor: session.actor,
    note: fields.note,
    uploads,
  });
  return issueResponse(scope, reportId);
});
