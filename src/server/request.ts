/**
 * Per-request plumbing shared by the route handlers.
 */
import { readSession, type AuthenticatedSession } from "./auth/session";
import { getContext, type ServerContext } from "./context";
import { ok } from "./http";
import { loadBundle, loadBundles } from "./reports/common";
import type { ReportRow } from "../../database/schema";
import { toIssue } from "./view";

export interface RequestScope {
  ctx: ServerContext;
  session: AuthenticatedSession | null;
  viewerId: string | null;
}

export async function begin(request: Request): Promise<RequestScope> {
  const ctx = await getContext();
  const session = await readSession(request, ctx.db, ctx.secret);
  return { ctx, session, viewerId: session?.user.id ?? null };
}

export const deps = (ctx: ServerContext) => ({
  db: ctx.db,
  ledger: ctx.ledger,
  store: ctx.store,
});

/** `Issue` for one report, as the mutation routes all return it. */
export async function issueResponse(
  scope: RequestScope,
  reportId: string,
  status = 200,
): Promise<Response> {
  const bundle = await loadBundle(scope.ctx.db, reportId);
  return ok(toIssue(bundle, scope.viewerId), status);
}

export async function issuesOf(scope: RequestScope, rows: ReportRow[]) {
  const bundles = await loadBundles(scope.ctx.db, rows);
  return bundles.map((b) => toIssue(b, scope.viewerId));
}
