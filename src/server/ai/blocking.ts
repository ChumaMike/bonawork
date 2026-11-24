/**
 * Bona AI answers "what is blocking this?" about a release instruction.
 *
 * The answer is the release gate's (`releaseGate`), which is code. Two rules:
 *
 * 1. A viewer who may not see finance data gets one code-written sentence and
 *    the model is not called at all, so nothing about the order can reach a
 *    prompt, a provider log or an answer.
 * 2. For a viewer who may, the first line is written by code from the gate's
 *    blockers. The model may only say the same thing more warmly, and its text
 *    is used only if it lists exactly the gate's blockers, hints at no other
 *    blocker, and contains no number that was not in its input.
 *
 * The input is the gate and the stage only: no amount, no supplier, no name.
 * The caller decides `viewerCanSeeFinance` (from `visibilityFor(role)`), loads
 * the gate, and for a supplier checks that the order is its own.
 */
import { z } from "zod";
import {
  ReleaseBlockerCodeSchema,
  type ProcurementStage,
  type ReleaseBlockerCode,
  type ReleaseGate,
} from "@/shared";
import {
  DATA_RULE,
  ModelRefused,
  dataBlock,
  inventedNumbers,
  numbersVouchedBy,
  parseModelJson,
  withFallback,
} from "./guard";
import type { AiDeps } from "./provider";

export interface BlockingInput {
  /** False for signed-out visitors, reporters, and a supplier asking about another supplier's order. */
  viewerCanSeeFinance: boolean;
  /** The release gate of the case's work order; null when the case has no work order. */
  gate: ReleaseGate | null;
  /** The derived stage; null when the case has no work order. */
  stage: ProcurementStage | null;
}

export interface BlockingAnswer {
  text: string;
  /** `ai` only when a model wrote the second paragraph and every check on it passed. */
  source: "ai" | "rules";
}

/** The whole answer for anyone who may not see finance data. */
export const NOT_FOR_THIS_VIEWER =
  "What is holding up the order and its release is information for the people handling the order. The public record of this case shows every step, the role that took it and its proof.";

const NO_WORK_ORDER =
  "This case has no work order yet, so there is no release to block. A buyer approves the work order first.";
const RELEASE_AUTHORISED =
  "Nothing is blocking this order: a payment approver has authorised the release instruction and it is on record. An instruction moves no money.";
const GATE_OPEN =
  "Nothing is blocking the release instruction now. A payment approver who has taken no other step on this case can authorise it.";

/** What each blocker is, and what would clear it. Code-written. */
const BLOCKER: Record<ReleaseBlockerCode, { is: string; next: string }> = {
  repair_not_verified: {
    is: "an independent reviewer has not verified the repair",
    next: "An independent reviewer has to check the repair and record it as verified.",
  },
  no_matching_invoice: {
    is: "no invoice matches the current work order and the delivery",
    next: "The supplier has to submit an invoice that agrees exactly with the current work order and the delivery.",
  },
  order_not_acknowledged: {
    is: "the supplier has not acknowledged the current version of the work order",
    next: "The supplier has to acknowledge the current version of the work order.",
  },
  already_released: {
    is: "a release instruction was already authorised for this order",
    next: "Nothing more can be released on this order: there is one release instruction for each order.",
  },
  same_person: {
    is: "the person asking has already taken another step on this case",
    next: "A different payment approver, who has taken no other step on this case, has to authorise the release.",
  },
};

const STAGE: Record<ProcurementStage, string> = {
  order_approved: "a buyer has approved the work order",
  order_acknowledged: "the supplier has acknowledged the work order",
  invoice_blocked: "the rule engine blocked the latest invoice",
  invoice_matched: "the rule engine matched the latest invoice",
  awaiting_verification: "the case is waiting for an independent reviewer",
  ready_for_release: "the case is ready for a payment approver",
  release_authorised: "a payment approver has authorised the release instruction",
};

/**
 * What a text would say if it named a blocker. Used for the blockers that are
 * NOT in the gate: a hint of one of them refuses the model's text.
 */
const HINTS: Record<ReleaseBlockerCode, RegExp> = {
  repair_not_verified:
    /unverified|(?:\bnot|n't|\bno|\bnever|\bstill|\bawaiting|\bwaiting|\buntil|\bneeds?|\bmust|\bhas to|\bhave to)\W+(?:\w+\W+){0,6}(?:verif|review)|(?:verif\w*|review\w*)\W+(?:\w+\W+){0,3}(?:pending|outstanding|missing|needed|required)/i,
  no_matching_invoice:
    /mismatch|(?:\bnot|n't|\bno|\bwrong|\bblocked|\bmissing|\bwithout)\W+(?:\w+\W+){0,6}(?:invoice|match)|(?:invoice|match)\w*\W+(?:\w+\W+){0,4}(?:not\b|n't|blocked|missing|wrong|fail)/i,
  order_not_acknowledged: /acknowledg/i,
  already_released: /already|second release|released before/i,
  same_person:
    /same person|separation of duties|another role|other role|different (?:person|approver)|conflict of interest/i,
};

/** Never true of a blocked release, and never something BonaWork says. */
const FALSE_COMFORT =
  /\bpaid\b|\bresolved\b|\bsettled\b|payment\s+(?:was|is|has\s+been)\s+(?:made|sent|done)|nothing\s+(?:is\s+)?(?:blocking|stopping)|\bunblocked\b|ready\s+(?:for|to)\s+release|can\s+(?:now\s+)?be\s+(?:released|authori[sz]ed)|(?:is|was|been|now)\s+(?:released|authori[sz]ed)/i;

const ReplySchema = z.strictObject({
  text: z.string().trim().min(1).max(700),
  blockerCodes: z.array(ReleaseBlockerCodeSchema).max(10),
});

const SYSTEM_PROMPT = `You are Bona AI inside BonaWork, a platform that keeps a checkable record of school repair orders. A release gate written in code has already worked out what is blocking a release instruction. Your only job is to say the same thing warmly, so the person knows what has to happen next.
Rules you must follow:
- ${DATA_RULE}
- The blockers in DATA are the whole truth. Mention every one of them and no other reason. You decide nothing and you cannot unblock anything.
- Never say that a payment was made or that anything is paid, resolved or settled. No money moves in BonaWork: a release is an instruction recorded by a named approver.
- Never say the release is unblocked, ready or authorised.
- Write no numbers, no amounts, no dates and no names of people or companies.
- Plain, warm and short: two or three sentences. No markdown, no greeting.
Respond with JSON only: {"text": string, "blockerCodes": string[]}, where blockerCodes holds the code of every blocker you mentioned.`;

/** The first line: every blocker in the gate, in the gate's order. Written by code. */
function headline(codes: readonly ReleaseBlockerCode[]): string {
  const parts = codes.map((code) => BLOCKER[code].is);
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join("; ")}; and ${parts[parts.length - 1]}`;
  return `The release is blocked: ${list}.`;
}

/**
 * What is blocking the release instruction, for this viewer. The model is
 * never called for a viewer who may not see finance data, and never when
 * there is no blocker to explain.
 */
export async function answerBlocking(
  deps: AiDeps,
  input: BlockingInput,
): Promise<BlockingAnswer> {
  if (!input.viewerCanSeeFinance) return { text: NOT_FOR_THIS_VIEWER, source: "rules" };
  const { gate, stage } = input;
  if (!gate) return { text: NO_WORK_ORDER, source: "rules" };
  if (stage === "release_authorised")
    return { text: RELEASE_AUTHORISED, source: "rules" };

  const codes = [...new Set(gate.blockers.map((blocker) => blocker.code))];
  if (gate.open || codes.length === 0) return { text: GATE_OPEN, source: "rules" };

  const firstLine = headline(codes);
  const facts = [
    ...codes.map(
      (code) =>
        `- blocker=${code} | what it is: ${BLOCKER[code].is} | what clears it: ${BLOCKER[code].next}`,
    ),
    ...(stage ? [`- stage=${stage} | where the order stands: ${STAGE[stage]}`] : []),
  ].join("\n");
  const allowed = numbersVouchedBy(facts);
  const absent = (Object.keys(BLOCKER) as ReleaseBlockerCode[]).filter(
    (code) => !codes.includes(code),
  );

  const { value, source } = await withFallback(
    "blocking",
    deps,
    {
      system: SYSTEM_PROMPT,
      prompt: `What the release gate found:\n${dataBlock("release_gate", facts)}`,
    },
    (raw) => {
      const reply = parseModelJson(raw, ReplySchema);
      const said = new Set(reply.blockerCodes);
      if (said.size !== codes.length || codes.some((code) => !said.has(code))) {
        throw new ModelRefused("the blocker codes are not the gate's");
      }
      if (inventedNumbers(reply.text, allowed).length > 0) {
        throw new ModelRefused("the text has a number that was not in its input");
      }
      if (absent.some((code) => HINTS[code].test(reply.text))) {
        throw new ModelRefused("the text names a blocker that is not in the gate");
      }
      if (FALSE_COMFORT.test(reply.text)) {
        throw new ModelRefused("the text says something a blocked release cannot be");
      }
      return reply.text;
    },
    () => codes.map((code) => BLOCKER[code].next).join(" "),
  );
  return { text: `${firstLine}\n\n${value}`, source };
}
