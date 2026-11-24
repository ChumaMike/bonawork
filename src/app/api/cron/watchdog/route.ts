import { cronAuthorised } from "@/app/api/ledger/retry/route";
import { getContext } from "@/server/context";
import { escrowDeps, escrowRoute, runCaseWatchdog } from "@/server/escrow";
import { HttpError, ok } from "@/server/http";

export const maxDuration = 300;

/**
 * `GET|POST /api/cron/watchdog` — the Escrow Watchdog. Releases verified
 * stages whose challenge window has ended and refunds expired ones, for every
 * escrow still being watched. Guarded by `CRON_SECRET` (header
 * `x-cron-secret` or a bearer token, as Vercel cron sends it).
 */
export const GET = escrowRoute(async (request) => {
  const ctx = await getContext();
  if (!cronAuthorised(request, ctx.env.CRON_SECRET)) {
    throw new HttpError("forbidden", "A valid x-cron-secret header is required.");
  }
  return ok(await runCaseWatchdog(await escrowDeps()));
});

export const POST = GET;
