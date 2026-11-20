import { eq } from "drizzle-orm";
import {
  requireInstitution,
  requirePermission,
  requireSession,
} from "@/server/auth/session";
import { schema } from "@/server/db";
import { HttpError, route } from "@/server/http";
import { isUuid } from "@/server/reports/common";
import { begin } from "@/server/request";

/**
 * `GET /api/evidence/:id/file` — the private file behind an evidence record.
 * Requires `evidence:read`: the school administrator of that institution, a
 * district official or a reviewer. Reporters and the public only ever see
 * metadata.
 */
export const GET = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "evidence:read");
  if (!isUuid(id)) throw new HttpError("not_found", `Unknown evidence: ${id}`);
  const [evidence] = await scope.ctx.db
    .select()
    .from(schema.evidenceCommitments)
    .where(eq(schema.evidenceCommitments.id, id))
    .limit(1);
  if (!evidence) throw new HttpError("not_found", `Unknown evidence: ${id}`);
  const [report] = await scope.ctx.db
    .select({ institutionId: schema.reports.institutionId })
    .from(schema.reports)
    .where(eq(schema.reports.id, evidence.reportId))
    .limit(1);
  requireInstitution(session, report.institutionId);
  const bytes = await scope.ctx.store.get(evidence.storageKey);
  if (!bytes) throw new HttpError("not_found", "The file is no longer in storage.");
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "content-type": evidence.mediaType,
      "content-length": String(bytes.byteLength),
      "content-disposition": `inline; filename="evidence-${evidence.version}.${evidence.mediaType.split("/")[1]}"`,
      "cache-control": "private, no-store",
      "x-evidence-digest": evidence.digest,
    },
  });
});
