import { z } from "zod";
import { REPORT_CATEGORIES } from "@/shared";
import { requirePermission } from "@/server/auth/session";
import { checkUploads } from "@/server/evidence/validate";
import { FormBoolean, ok, parseForm, route } from "@/server/http";
import { GUEST_REPORTER, loadBundle } from "@/server/reports/common";
import { createReport } from "@/server/reports/create";
import { begin, deps } from "@/server/request";
import { toReportCategory, toSubmissionReceipt } from "@/server/view";

const Fields = z.object({
  schoolId: z.string().min(1, "Choose a school."),
  category: z.string().transform(toReportCategory).pipe(z.enum(REPORT_CATEGORIES)),
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(1, "Describe the problem.").max(5000),
  location: z.string().trim().max(200).default(""),
  anonymous: FormBoolean.default(false),
});

/**
 * `POST /api/reports` — multipart: fields + `evidence` files (0..n). Returns a `SubmissionReceipt`.
 * No session is required: a signed-out visitor reports as "Reporter" with no reporter id.
 * A signed-in account is recorded (staff accounts are refused: `forbidden`).
 */
export const POST = route(async (request) => {
  const scope = await begin(request);
  const actor = scope.session
    ? requirePermission(scope.session, "report:create").actor
    : GUEST_REPORTER;
  const { fields, files } = await parseForm(request, Fields);
  const uploads = await checkUploads(files);
  const report = await createReport(deps(scope.ctx), {
    actor,
    institutionIdOrSlug: fields.schoolId,
    category: fields.category,
    title: fields.title,
    description: fields.description,
    location: fields.location,
    anonymous: fields.anonymous,
    uploads,
  });
  const bundle = await loadBundle(scope.ctx.db, report.id);
  return ok(toSubmissionReceipt(bundle), 201);
});
