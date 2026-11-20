import { z } from "zod";
import { askAssistant, assistantDeps } from "@/server/ai/assistant";
import { getContext } from "@/server/context";
import { ok, parseJson, route } from "@/server/http";

const Message = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(4000),
});
const Body = z.object({
  history: z.array(Message).max(40).default([]),
  question: z.string().trim().min(1, "Ask something.").max(1000),
});

/** `POST /api/assistant` — Bona AI, grounded in database records only. */
export const POST = route(async (request) => {
  const body = await parseJson(request, Body);
  const ctx = await getContext();
  return ok(
    await askAssistant(assistantDeps(ctx.db, ctx.env), {
      question: body.question,
      history: body.history,
    }),
  );
});
