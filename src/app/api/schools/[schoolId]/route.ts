import { eq } from "drizzle-orm";
import { getContext } from "@/server/context";
import { schema } from "@/server/db";
import { HttpError, ok, route } from "@/server/http";
import { findInstitution, loadBundles } from "@/server/reports/common";
import { toSchoolProfile } from "@/server/view";

/** `GET /api/schools/:schoolId` — accepts the UUID or the slug. */
export const GET = route<{ schoolId: string }>(async (_request, { schoolId }) => {
  const ctx = await getContext();
  const institution = await findInstitution(ctx.db, schoolId);
  if (!institution) throw new HttpError("not_found", `Unknown school: ${schoolId}`);
  const reports = await ctx.db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.institutionId, institution.id));
  const bundles = await loadBundles(ctx.db, reports);
  return ok(toSchoolProfile(institution, bundles));
});
