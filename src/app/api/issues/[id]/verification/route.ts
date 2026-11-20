import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { checkUploads } from "@/server/evidence/validate";
import { parseForm, route } from "@/server/http";
import { submitVerification } from "@/server/reports/review";
import { begin, deps, issueResponse } from "@/server/request";

const Fields = z.object({
  outcome: z.enum(["verified", "disputed"]),
  note: z.string().trim().min(1).max(5000),
});

/**
 * `POST /api/issues/:id/verification` — multipart `outcome`, `note` + `evidence` (0..n).
 * `registerEvidence(review)*`, then `verifyRepair` or `disputeRepair`.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requireSession(scope.session);
  const { fields, files } = await parseForm(request, Fields);
  const uploads = await checkUploads(files);
  const reportId = await submitVerification(deps(scope.ctx), {
    reportIdOrReference: id,
    actor: session.actor,
    outcome: fields.outcome,
    note: fields.note,
    uploads,
  });
  return issueResponse(scope, reportId);
});
