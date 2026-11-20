import { API_ERROR_STATUS } from "@/shared";
import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { ReleaseBlockedError, authoriseRelease } from "@/server/procurement/release";
import { loadMoneyTrail } from "@/server/procurement/view";
import { begin, deps } from "@/server/request";

/**
 * `POST /api/issues/:id/release` — the payment approver authorises the
 * release instruction. No body. No money moves. Returns the `MoneyTrail`, 201.
 *
 * While the release gate is shut the answer is 409 in the usual error
 * envelope, with one extra field naming every blocker:
 *
 *   { "error": { "code": "conflict", "message": "…", "blockers": [{ "code": "repair_not_verified" }] } }
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "release:authorise");
  try {
    const reportId = await authoriseRelease(deps(scope.ctx), {
      reportIdOrReference: id,
      actor: session.actor,
    });
    return ok(await loadMoneyTrail(scope.ctx, reportId, session.actor), 201);
  } catch (error) {
    if (!(error instanceof ReleaseBlockedError)) throw error;
    return Response.json(
      { error: { code: error.code, message: error.message, blockers: error.blockers } },
      { status: API_ERROR_STATUS[error.code] },
    );
  }
});
