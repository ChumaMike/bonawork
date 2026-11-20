import { z } from "zod";
import { requirePermission } from "@/server/auth/session";
import { checkUploads } from "@/server/evidence/validate";
import { ok, parseForm, route } from "@/server/http";
import { GUEST_REPORTER } from "@/server/reports/common";
import { addEvidence } from "@/server/reports/evidence";
import { begin, deps } from "@/server/request";
import { toEvidenceItem } from "@/server/view";

const Fields = z.object({
  purpose: z.enum(["problem", "progress", "repair_claim", "review"]).default("problem"),
});

/**
 * `POST /api/issues/:id/evidence` — multipart: `purpose` + `evidence` files (1..n).
 * No session is required for `problem`/`progress` evidence (a signed-out visitor
 * uploads as "Reporter"); staff purposes need the matching signed-in role.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const actor = scope.session
    ? requirePermission(scope.session, "evidence:upload").actor
    : GUEST_REPORTER;
  const { fields, files } = await parseForm(request, Fields);
  const uploads = await checkUploads(files, 1);
  const rows = await addEvidence(deps(scope.ctx), {
    reportIdOrReference: id,
    actor,
    purpose: fields.purpose,
    uploads,
  });
  return ok(rows.map(toEvidenceItem), 201);
});
