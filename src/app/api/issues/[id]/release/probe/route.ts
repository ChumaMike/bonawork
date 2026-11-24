import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { probeRelease } from "@/server/procurement/release";
import { begin, deps } from "@/server/request";

/**
 * `POST /api/issues/:id/release/probe`: asks the ledger whether it would accept
 * a release for this case right now. Needs `release:authorise`. Never writes:
 * on devnet it is a simulated call to the institution's Finance contract, which
 * answers with its own refusal (for example `RepairNotVerified`).
 *
 * 401 signed out · 403 another role · 404 an unknown report or no work order.
 */
export const POST = route<{ id: string }>(async (request, { id }) => {
  const scope = await begin(request);
  const session = requirePermission(requireSession(scope.session), "release:authorise");
  return ok(
    await probeRelease(deps(scope.ctx), {
      reportIdOrReference: id,
      actor: session.actor,
    }),
  );
});
