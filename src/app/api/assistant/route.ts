import { z } from "zod";
import { askAssistant, assistantDeps, isBlockingQuestion } from "@/server/ai/assistant";
import { answerBlocking } from "@/server/ai/blocking";
import { aiDeps } from "@/server/ai/provider";
import { ok, parseJson, route } from "@/server/http";
import { loadGateForViewer } from "@/server/procurement/view";
import { findReport } from "@/server/reports/common";
import { begin } from "@/server/request";
import { can } from "@/shared";

const Message = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});
const Body = z.object({
  history: z.array(Message).max(40).default([]),
  question: z.string().trim().min(1, "Ask something.").max(1000),
});

const REFERENCE = /\bBB-\d{4}-\d{6}\b/i;

/**
 * `POST /api/assistant` — Bona AI, grounded in database records only.
 *
 * "What is blocking payment on BB-…?" is answered from the case's release gate.
 * Only a signed-in role that may read the procurement trail of that case gets
 * the blockers; everyone else gets a code-written sentence and no finance data
 * reaches the model. The first line is always written by code.
 */
export const POST = route(async (request) => {
  const body = await parseJson(request, Body);
  const scope = await begin(request);
  const { ctx } = scope;

  const reference = body.question.match(REFERENCE)?.[0].toUpperCase();
  if (reference && isBlockingQuestion(body.question)) {
    const report = await findReport(ctx.db, reference);
    if (report) {
      const actor = scope.session?.actor ?? null;
      const mayRead = actor !== null && can(actor.role, "procurement:read");
      const loaded = mayRead ? await loadGateForViewer(ctx, report.id, actor) : null;
      // A supplier asking about someone else's order is treated like the public.
      const hidden = !mayRead || (loaded === null && actor?.role === "supplier");
      const answer = await answerBlocking(aiDeps(ctx.env), {
        viewerCanSeeFinance: !hidden,
        gate: loaded?.gate ?? null,
        stage: loaded?.stage ?? null,
      });
      return ok({
        id: crypto.randomUUID(),
        role: "assistant" as const,
        text: answer.text,
        actions: [{ label: `Open ${reference}`, href: `/issues/${report.id}` }],
      });
    }
  }

  return ok(
    await askAssistant(assistantDeps(ctx.db, ctx.env), {
      question: body.question,
      history: body.history,
    }),
  );
});
