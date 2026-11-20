/**
 * Bona AI explains a blocked three-way match in plain words.
 *
 * The rule engine (`matchThreeWay`) has already decided. The model is given
 * only the engine's reason codes and their numbers, never the invoice text,
 * and may only say those reasons again more warmly. Its text is used only when
 * code can check it:
 *
 * - it lists exactly the engine's reason codes;
 * - every number in it is a number from the reasons;
 * - it names every line the reasons are about;
 * - it does not use a word that sounds like a decision.
 *
 * Anything else, and any provider failure, gives the code-written explanation
 * (`ruleExplanation`). The first line, the outcome, is always written by code.
 */
import { z } from "zod";
import {
  MATCHED_EXPLANATION,
  MatchReasonCodeSchema,
  formatRand,
  ruleExplanation,
  type MatchOutcome,
  type MatchReason,
  type MatchReasonCode,
  type MismatchExplanation,
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

export interface ExplainInput {
  outcome: MatchOutcome;
  /**
   * The engine's reasons, as this viewer may see them: for a viewer who may
   * not see prices, pass the reasons with the price numbers already removed.
   */
  reasons: readonly MatchReason[];
}

/** What each code means. Code-written; the model is told this, it does not decide it. */
const MEANING: Record<MatchReasonCode, string> = {
  order_version_changed:
    "The invoice names a version of the work order that is no longer the current one.",
  order_not_acknowledged:
    "The supplier has not acknowledged the current version of the work order.",
  wrong_supplier:
    "The supplier reference on the invoice is not the one on the work order.",
  duplicate_invoice: "This invoice number was already used on this work order.",
  missing_receipt:
    "No delivery has been recorded for the current version of the work order.",
  unknown_line: "The invoice has a line that is not on the work order.",
  missing_line: "The work order has a line that is not on the invoice.",
  excess_quantity: "More was invoiced on this line than arrived.",
  quantity_mismatch: "The quantity invoiced on this line is not the quantity ordered.",
  unit_price_mismatch:
    "The unit price invoiced on this line is not the unit price ordered.",
  total_mismatch: "The total stated on the invoice is not the amount it should be.",
};

/** What `expected` and `actual` are for the codes that carry numbers. */
const NUMBERS: Partial<Record<MatchReasonCode, { expected: string; actual: string }>> = {
  order_version_changed: {
    expected: "current order version",
    actual: "version on the invoice",
  },
  excess_quantity: { expected: "quantity that arrived", actual: "quantity invoiced" },
  quantity_mismatch: { expected: "quantity ordered", actual: "quantity invoiced" },
  unit_price_mismatch: {
    expected: "unit price ordered",
    actual: "unit price invoiced",
  },
  total_mismatch: { expected: "total it should be", actual: "total on the invoice" },
};

/** The two codes whose numbers are cents. */
const IN_CENTS: ReadonlySet<MatchReasonCode> = new Set([
  "unit_price_mismatch",
  "total_mismatch",
]);

/**
 * A line code is typed by a buyer or a supplier. Only one that looks like a
 * code reaches the model; anything else is given a neutral name, and code
 * says afterwards which line that name stands for.
 */
const SAFE_SKU = /^[A-Za-z0-9][A-Za-z0-9._/#-]{0,31}$/;

const WORDS_OF_DECISION =
  /\b(approv\w*|authori[sz]\w*|verified|released|cleared|passed|paid|resolved|settled)\b|payment\s+(?:was|is|has\s+been)\s+(?:made|sent|done)/i;
const MATCHED = /\bmatched\b/i;

const ReplySchema = z.strictObject({
  text: z.string().trim().min(1).max(900),
  reasonCodes: z.array(MatchReasonCodeSchema).max(30),
});

const SYSTEM_PROMPT = `You are Bona AI inside Bona Chain, a platform that keeps a checkable record of school repair orders. Rules written in code have compared an invoice with the work order and the delivery, and blocked the invoice. Your only job is to say the reasons again in plain, kind words for a busy person.
Rules you must follow:
- ${DATA_RULE}
- The outcome and the reasons were decided by code and are final. You decide nothing. Never say that the invoice is approved, matched, verified, authorised, released, cleared, paid or resolved, and never tell anyone what to approve.
- Explain every reason in DATA and no other. Add no cause, no blame, no guess and no advice about money.
- Use only the numbers written in DATA, written the same way. Do not count the reasons and do not add, subtract or work out a difference.
- Name a line only by the label DATA gives it.
- Plain and short: one sentence for each reason. No markdown, no greeting.
Respond with JSON only: {"text": string, "reasonCodes": string[]}, where reasonCodes holds the code of every reason you explained.`;

/** The first line of every answer. Code writes it; no model text can replace it. */
const blockedLine = (count: number) =>
  `Invoice blocked. The rules found ${count === 1 ? "1 problem" : `${count} problems`}. Nothing was approved.`;
const BLOCKED_NO_REASONS =
  "Invoice blocked. The rules recorded no reason for this result. Nothing was approved.";
const MATCHED_LINE = `Invoice matched. ${MATCHED_EXPLANATION} This is a check by the rules: it is not an approval and it releases nothing.`;

interface Fact {
  reason: MatchReason;
  /** The name the model sees for the line; null for a reason about the whole invoice. */
  label: string | null;
}

/** `item A`, `item B`, ... : a name with no digits, so it adds no number to the text. */
function neutralName(index: number): string {
  let n = index;
  let letters = "";
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `item ${letters}`;
}

function name(reasons: readonly MatchReason[]): {
  facts: Fact[];
  aliases: Map<string, string>;
} {
  const aliases = new Map<string, string>();
  const facts = reasons.map((reason): Fact => {
    if (reason.sku === null) return { reason, label: null };
    if (SAFE_SKU.test(reason.sku)) return { reason, label: reason.sku };
    const alias = aliases.get(reason.sku) ?? neutralName(aliases.size);
    aliases.set(reason.sku, alias);
    return { reason, label: alias };
  });
  return { facts, aliases };
}

const amount = (code: MatchReasonCode, value: number) =>
  IN_CENTS.has(code) ? formatRand(value) : String(value);

function factLine({ reason, label }: Fact): string {
  const names = NUMBERS[reason.code] ?? { expected: "expected", actual: "actual" };
  const parts = [`code=${reason.code}`, `meaning: ${MEANING[reason.code]}`];
  parts.push(`line: ${label ?? "the whole invoice"}`);
  if (reason.expected !== null) {
    parts.push(`${names.expected}: ${amount(reason.code, reason.expected)}`);
  }
  if (reason.actual !== null) {
    parts.push(`${names.actual}: ${amount(reason.code, reason.actual)}`);
  }
  return `- ${parts.join(" | ")}`;
}

/**
 * Why a match was blocked, in plain words. `source` is `ai` only when a model
 * wrote the body and every check on it passed; the first line is code either way.
 */
export async function explainMismatch(
  deps: AiDeps,
  input: ExplainInput,
): Promise<MismatchExplanation> {
  const { outcome, reasons } = input;
  // Nothing to explain: the model is not asked.
  if (outcome === "matched") return { text: MATCHED_LINE, source: "rules" };
  if (reasons.length === 0) return { text: BLOCKED_NO_REASONS, source: "rules" };

  const { facts, aliases } = name(reasons);
  const labels = [...new Set(facts.flatMap((fact) => fact.label ?? []))];
  const engineCodes = new Set(reasons.map((reason) => reason.code));
  // The numbers a text may carry: the reasons' own, written as above, and digits inside line codes.
  const allowed = numbersVouchedBy(
    facts
      .flatMap(({ reason, label }) => [
        label ?? "",
        reason.expected === null ? "" : amount(reason.code, reason.expected),
        reason.actual === null ? "" : amount(reason.code, reason.actual),
      ])
      .join("\n"),
  );

  const { value, source } = await withFallback(
    "explain-mismatch",
    deps,
    {
      system: SYSTEM_PROMPT,
      prompt: `Outcome decided by the rules: blocked.\n${dataBlock("engine_reasons", facts.map(factLine).join("\n"))}`,
    },
    (raw) => {
      const reply = parseModelJson(raw, ReplySchema);
      const said = new Set(reply.reasonCodes);
      if (said.size !== engineCodes.size || [...said].some((c) => !engineCodes.has(c))) {
        throw new ModelRefused("the reason codes are not the engine's");
      }
      if (inventedNumbers(reply.text, allowed).length > 0) {
        throw new ModelRefused("the text has a number that is not in the reasons");
      }
      if (WORDS_OF_DECISION.test(reply.text) || MATCHED.test(reply.text)) {
        throw new ModelRefused("the text uses a word of decision");
      }
      const lower = reply.text.toLowerCase();
      if (labels.some((label) => !lower.includes(label.toLowerCase()))) {
        throw new ModelRefused("the text leaves out a line the reasons name");
      }
      return reply.text;
    },
    () => ruleExplanation(reasons),
  );

  // Lines the model saw under a neutral name: code says which line each one is.
  const legend =
    source === "ai" && aliases.size > 0
      ? `\n${[...aliases].map(([sku, alias]) => `${alias} is the line "${sku}".`).join("\n")}`
      : "";
  return { text: `${blockedLine(reasons.length)}\n\n${value}${legend}`, source };
}
