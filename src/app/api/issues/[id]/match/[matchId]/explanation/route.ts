import { explainMismatch } from "@/server/ai/explain-mismatch";
import { aiDeps } from "@/server/ai/provider";
import { requirePermission, requireSession } from "@/server/auth/session";
import { ok, route } from "@/server/http";
import { loadMatchForViewer } from "@/server/procurement/view";
import { begin } from "@/server/request";

/**
 * `POST /api/issues/:id/match/:matchId/explanation`: a plain-language
 * explanation of one three-way match result. Needs `procurement:read`.
 *
 * The rule engine already decided the outcome and its reasons; they are loaded
 * for this viewer (prices removed for roles that may not see them) and Bona AI
 * may only reword them. It writes nothing. When the model is off, slow or
 * answers anything the checks reject, the code-written explanation is returned.
 *
 * 401 signed out · 403 no `procurement:read`, another supplier's order ·
 * 404 an unknown report or match result.
 */
export const POST = route<{ id: string; matchId: string }>(
  async (request, { id, matchId }) => {
    const scope = await begin(request);
    const session = requirePermission(requireSession(scope.session), "procurement:read");
    const match = await loadMatchForViewer(scope.ctx, id, matchId, session.actor);
    return ok(
      await explainMismatch(aiDeps(scope.ctx.env), {
        outcome: match.outcome,
        reasons: match.reasons,
      }),
    );
  },
);
