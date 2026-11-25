/**
 * Reviewer Copilot: a checklist for the independent reviewer.
 *
 * - The base checks are written in code for the stage (materials or completion).
 * - Two checks, one per payment stage: "Check 1: Materials on site" and
 *   "Check 2: Work done". At Check 1 every price-check flag of `check` or
 *   `high` becomes "Ask for a breakdown": a question, never an accusation.
 * - A model may add up to 8 extra checks, each tied to an invoice line. The
 *   invoice and milestone text are DATA. A check that names an unknown line,
 *   carries a number the invoice does not, or uses a word of decision is
 *   dropped. The model never ticks, passes or fails anything.
 * - The reviewer edits and ticks. The result is canonical JSON whose SHA-256
 *   is the `review_hash` written on-chain with the reviewer's own signature.
 */
import { z } from "zod";
import {
  CHECK_TITLES,
  type ChecklistDraft,
  type ChecklistItem,
  type ChecklistRequest,
  ChecklistRequestSchema,
} from "@/features/agent/contracts";
import {
  DATA_RULE,
  dataBlock,
  inventedNumbers,
  numbersVouchedBy,
  parseModelJson,
  stripPii,
  withFallback,
} from "../ai/guard";
import type { AiDeps } from "../ai/provider";

export const MAX_AI_CHECKS = 8;

/** The two checks, one per payment stage. Each gets its own record and its own review hash. */
export { CHECK_TITLES };

const TEMPLATE: Record<"materials" | "completion", string[]> = {
  materials: [
    "Every item on the invoice is on site.",
    "Models and sizes match the invoice lines.",
    "Quantities match the invoice.",
    "Labels and packaging match what was invoiced.",
    "Photo of the delivery, with the delivery note or till slip in the picture.",
  ],
  completion: [
    "The parts are installed, not only delivered.",
    "Each repair works when tested in front of you (flush it, open the tap, switch it on).",
    "The old or broken part is removed from the site.",
    "Before and after photos are taken from the same spot.",
  ],
};

/** Words that sound like a decision. A model check that uses one is dropped. */
const WORDS_OF_DECISION =
  /\b(approv\w*|authori[sz]\w*|verif\w*|releas\w*|pa(id|y\w*)|resolved|sign\w*|pass(ed)?|accept\w*|clear(ed)?)\b/i;

const ExtraReplySchema = z.strictObject({
  checks: z
    .array(
      z.strictObject({
        lineId: z.string().min(1).max(64),
        text: z.string().trim().min(8).max(200),
      }),
    )
    .max(MAX_AI_CHECKS * 2),
});

const SYSTEM_PROMPT = `You are Bona AI inside BonaWork. An independent reviewer will visit a school to check a repair before money can move. Code has already written the standard checks. Your only job is to suggest extra things to look at on site, each tied to one invoice line.
Rules you must follow:
- ${DATA_RULE}
- Each check is one short instruction for what to look at, count or test on site, about one invoice line, given by its line id.
- You decide nothing. Never say anything is approved, verified, passed, paid or released, and never tell the reviewer what outcome to choose.
- Use only numbers that appear in DATA.
- At most ${MAX_AI_CHECKS} checks. Plain words.
Respond with JSON only: {"checks": [{"lineId": string, "text": string}]}`;

/** The code-written checks: the stage template, one count per material line, one question per price flag. */
export function baseChecklist(input: ChecklistRequest): ChecklistItem[] {
  const req = ChecklistRequestSchema.parse(input);
  const items: ChecklistItem[] = TEMPLATE[req.stage].map((text, i) => ({
    id: `t-${i + 1}`,
    text,
    lineId: null,
    origin: "template",
  }));
  if (req.stage === "materials") {
    req.lines.slice(0, 12).forEach((line, i) => {
      items.push({
        id: `l-${i + 1}`,
        text: `Count ${line.quantity} x ${line.description.slice(0, 120)} and check the model.`,
        lineId: line.lineId,
        origin: "template",
      });
    });
  }
  // Price questions belong to Check 1, when the invoice and the goods are in front of the reviewer.
  if (req.stage !== "materials") return items;
  const byId = new Map(req.lines.map((l) => [l.lineId, l]));
  req.priceFlags
    .filter((f) => f.level === "high" || f.level === "check")
    .forEach((flag, i) => {
      const line = byId.get(flag.lineId);
      if (!line) return;
      const gap = flag.percentAbove !== null ? `${flag.percentAbove}% above` : "above";
      items.push({
        id: `p-${i + 1}`,
        text: `Ask for a breakdown: ${line.description.slice(0, 120)} is ${gap} shop prices. Note the answer.`,
        lineId: flag.lineId,
        origin: "price_flag",
      });
    });
  return items;
}

/** The checks code adds when no model answers: one specification check per line, first four lines. */
function ruleExtras(req: z.infer<typeof ChecklistRequestSchema>): ChecklistItem[] {
  return req.lines.slice(0, 4).map((line, i) => ({
    id: `s-${i + 1}`,
    text: `Check that ${line.description.slice(0, 120)} is the size and type the work order asks for.`,
    lineId: line.lineId,
    origin: "template" as const,
  }));
}

export async function draftChecklist(
  deps: AiDeps,
  input: ChecklistRequest,
): Promise<ChecklistDraft> {
  const req = ChecklistRequestSchema.parse(input);
  const base = baseChecklist(req);
  const lineIds = new Set(req.lines.map((l) => l.lineId));
  const invoiceText = req.lines
    .map((l) => `line ${l.lineId}: ${l.quantity} x ${stripPii(l.description)}`)
    .join("\n");
  const allowed = numbersVouchedBy(`${invoiceText}\n${req.milestone}`);

  if (req.lines.length === 0) return { items: base, extraSource: "rules" };

  const { value, source } = await withFallback(
    "reviewer-copilot",
    deps,
    {
      system: SYSTEM_PROMPT,
      prompt: `Stage: ${req.stage}.\n${dataBlock("milestone", stripPii(req.milestone))}\n${dataBlock("invoice_lines", invoiceText)}`,
      maxOutputTokens: 600,
    },
    (raw) =>
      parseModelJson(raw, ExtraReplySchema)
        .checks.filter(
          (c) =>
            lineIds.has(c.lineId) &&
            !WORDS_OF_DECISION.test(c.text) &&
            inventedNumbers(c.text, allowed).length === 0,
        )
        .slice(0, MAX_AI_CHECKS)
        .map(
          (c, i): ChecklistItem => ({
            id: `a-${i + 1}`,
            text: c.text,
            lineId: c.lineId,
            origin: "ai",
          }),
        ),
    () => ruleExtras(req),
  );
  return { items: [...base, ...value], extraSource: source };
}

/* --------------------------------- Hashing -------------------------------- */

/** `reviewHash(record)` gives the 32-byte `review_hash`; the browser uses the same code. */
export { canonicalReview, reviewHash, reviewHashHex } from "@/features/agent/review-hash";
