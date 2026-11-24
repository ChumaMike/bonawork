import { getContext } from "@/server/context";
import { HttpError, ok, route } from "@/server/http";
import { resetDatabase } from "@/server/seed";
import { cronAuthorised } from "../../ledger/retry/route";

/**
 * `POST /api/demo/reset` — truncate everything and seed again through the
 * configured ledger (with Solana this re-anchors and costs gas). Only
 * exists when `DEMO_RESET_ENABLED=true` and the `x-cron-secret` header
 * matches `CRON_SECRET`; otherwise 404.
 */
export const POST = route(async (request) => {
  // Guard before touching the database so an unarmed route is a plain 404.
  if (
    process.env.DEMO_RESET_ENABLED !== "true" ||
    !cronAuthorised(request, process.env.CRON_SECRET)
  ) {
    throw new HttpError("not_found", "Not found.");
  }
  const ctx = await getContext();
  const started = Date.now();
  await resetDatabase(ctx);
  return ok({ reset: true, ledger: ctx.ledgerMode, tookMs: Date.now() - started });
});
