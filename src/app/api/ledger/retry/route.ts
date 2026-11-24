import { getContext } from "@/server/context";
import { HttpError, ok, route } from "@/server/http";
import { processLedgerJobs } from "@/server/reports/anchor";

/** True when the request carries `CRON_SECRET` (header `x-cron-secret` or a bearer token, as Vercel cron sends it). */
export function cronAuthorised(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret || bearer === secret;
}

/** Solana needs seconds per write; allow the function the time to work through a queue. */
export const maxDuration = 300;

/** Stop starting new writes well before `maxDuration`, so the response always arrives. */
const BUDGET_MS = 200_000;

/**
 * `POST /api/ledger/retry` — sends queued ledger writes (after a seed or a
 * demo reset, or ones whose anchoring failed) and refreshes `pending`
 * receipts. Works for about 200 s per call; when `remaining` is above 0, call
 * again. Guarded by `CRON_SECRET`; also run by the Vercel cron in `vercel.json`.
 */
export const POST = route(async (request) => {
  const ctx = await getContext();
  if (!cronAuthorised(request, ctx.env.CRON_SECRET)) {
    throw new HttpError("forbidden", "A valid x-cron-secret header is required.");
  }
  return ok(await processLedgerJobs(ctx.db, ctx.ledger, { budgetMs: BUDGET_MS }));
});

/** Vercel cron jobs are GET requests. */
export const GET = POST;
