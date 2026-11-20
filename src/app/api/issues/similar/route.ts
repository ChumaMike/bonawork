import { z } from "zod";
import { getContext } from "@/server/context";
import { ok, parseJson, route } from "@/server/http";
import { findInstitution, loadBundles } from "@/server/reports/common";
import { findSimilarReports } from "@/server/reports/similar";
import { begin } from "@/server/request";
import { toReportCategory, toSummary } from "@/server/view";

const Body = z.object({
  schoolId: z.string().min(1),
  text: z.string().max(6000),
  category: z.string().optional(),
});

/** `POST /api/issues/similar` — "this looks like an existing report". */
export const POST = route(async (request) => {
  const body = await parseJson(request, Body);
  const scope = await begin(request);
  const ctx = await getContext();
  const institution = await findInstitution(ctx.db, body.schoolId);
  if (!institution) return ok([]);
  const rows = await findSimilarReports(ctx.db, {
    institutionId: institution.id,
    text: body.text,
    category: body.category ? toReportCategory(body.category) : undefined,
  });
  const bundles = await loadBundles(ctx.db, rows);
  return ok(bundles.map((b) => toSummary(b, scope.viewerId)));
});
