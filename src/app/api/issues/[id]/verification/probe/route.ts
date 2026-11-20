import { requireSession } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { probeVerification } from "@/server/reports/review";
import { begin } from "@/server/request";

/**
 * `POST /api/issues/:id/verification/probe` — asks the contract whether the
 * caller's chain role could verify now. A school administrator sees
 * `SchoolAdminCannotVerify` from the ledger itself. Never writes.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requireSession(scope.session);
  return ok(
    await probeVerification(
      { db: scope.ctx.db, ledger: scope.ctx.ledger },
      { reportIdOrReference: id, actor: session.actor },
    ),
  );
});
