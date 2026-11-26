import { requireSession } from "@/server/auth/session";
import { getContext } from "@/server/context";
import {
  confirmDemoScope,
  demoPriceCheck,
  readDemoCookie,
  requireDemoMode,
} from "@/server/demo/guided";
import { HttpError, ok, route } from "@/server/http";
import { begin } from "@/server/request";

/**
 * `GET /api/demo/guided/scope`: the sample job's price check against the
 * recorded South African shop prices (no live search, nothing is sent).
 */
export const GET = route(async () => {
  requireDemoMode();
  return ok(await demoPriceCheck(), 200, { "cache-control": "no-store" });
});

/**
 * `POST /api/demo/guided/scope`: the School confirms the job and its prices
 * for this browser's demo case. Check 1 is the materials, Check 2 the labour.
 */
export const POST = route(async (request) => {
  requireDemoMode();
  const scope = await begin(request);
  const session = requireSession(scope.session);
  const ctx = await getContext();
  const cookie = readDemoCookie(request, ctx.secret);
  if (!cookie) throw new HttpError("forbidden", "Start the demo first.");
  if (cookie.shared) {
    throw new HttpError(
      "forbidden",
      "This is a shared sample case. Watch it, or try later.",
    );
  }
  return ok(
    await confirmDemoScope(ctx, { caseId: cookie.caseId, actor: session.actor }),
    201,
  );
});
