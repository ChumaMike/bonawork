import { eq, inArray } from "drizzle-orm";
import { Hex32Schema } from "@/shared";
import { getContext } from "@/server/context";
import { schema } from "@/server/db";
import { ok, queryOf, route } from "@/server/http";
import { loadBundles } from "@/server/reports/common";
import { toEvidenceItem, toSummary } from "@/server/view";

/** `GET /api/verify/evidence?digest=0x…` — every evidence record with this digest. */
export const GET = route(async (request) => {
  const digest = Hex32Schema.parse((queryOf(request).digest ?? "").trim().toLowerCase());
  const ctx = await getContext();
  const evidence = await ctx.db
    .select()
    .from(schema.evidenceCommitments)
    .where(eq(schema.evidenceCommitments.digest, digest));
  if (evidence.length === 0) return ok([]);
  const reports = await ctx.db
    .select()
    .from(schema.reports)
    .where(inArray(schema.reports.id, [...new Set(evidence.map((e) => e.reportId))]));
  const bundles = await loadBundles(ctx.db, reports);
  return ok(
    evidence.map((item) => ({
      issue: toSummary(
        bundles.find((b) => b.report.id === item.reportId)!,
        null,
      ),
      evidence: toEvidenceItem(item),
    })),
  );
});
