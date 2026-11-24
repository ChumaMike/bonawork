/**
 * "Where's the money?" for anyone: answered only from public on-chain state.
 *
 * Code reads the escrow, its two stages and the vault from Solana and writes
 * the facts. Only those facts go to the model: no names, no report text, no
 * contact details, nothing private. The model may only say the facts again
 * for the question asked; any number it writes must be one of the facts'
 * numbers, and it may not use words like "paid" or "approved". Otherwise, or
 * with no model, a code-written answer is used. The facts are always shown.
 */
import { z } from "zod";
import type { MoneyAnswer } from "@/features/agent/contracts";
import { formatRand } from "@/shared/price-check";
import {
  DATA_RULE,
  ModelRefused,
  clamp,
  dataBlock,
  inventedNumbers,
  numbersVouchedBy,
  parseModelJson,
  stripPii,
  withFallback,
} from "../ai/guard";
import type { AiDeps } from "../ai/provider";
import type { OnChainCase } from "../solana/escrow-service";

export type StageState = "Pending" | "Claimed" | "Verified" | "Disputed" | "Released" | "Refunded";

/** The public state of one escrow, as code reads it from the chain. Amounts in cents. */
export interface PublicMoneyState {
  sample: boolean;
  escrow: string;
  totalCents: number;
  heldCents: number;
  releasedCents: number;
  refundedCents: number;
  funded: boolean;
  cancelled: boolean;
  /** Unix seconds. */
  fundingDeadline: number;
  stages: {
    name: "Stage 1 (materials)" | "Stage 2 (completion)";
    amountCents: number;
    state: StageState;
    /** Unix seconds; 0 when not set. */
    challengeUntil: number;
    verificationDeadline: number;
  }[];
  links: { label: string; href: string }[];
}

const STAGE_NAMES = ["Stage 1 (materials)", "Stage 2 (completion)"] as const;

/** On-chain case to public state. Only amounts, states and times: nothing about people. */
export function publicStateFromChain(c: OnChainCase): PublicMoneyState {
  const a = c.account;
  return {
    sample: false,
    escrow: c.escrow,
    totalCents: Number(a.totalAmount),
    heldCents: Number(c.vault.amount),
    releasedCents: Number(a.releasedAmount),
    refundedCents: Number(a.refundedAmount),
    funded: a.funded,
    cancelled: a.cancelled,
    fundingDeadline: Number(a.fundingDeadline),
    stages: c.tranches.map((t, i) => ({
      name: STAGE_NAMES[i],
      amountCents: Number(t.account.amount),
      state: t.state as StageState,
      challengeUntil: Number(t.account.challengeUntil),
      verificationDeadline: Number(t.account.verificationDeadline),
    })),
    links: [
      { label: "Escrow on Solana Explorer (devnet)", href: c.links.escrow },
      { label: "Vault on Solana Explorer (devnet)", href: c.links.vault },
    ],
  };
}

/** A labelled sample for the demo page, so it works without a network. */
export const SAMPLE_MONEY_STATE: PublicMoneyState = {
  sample: true,
  escrow: "sample",
  totalCents: 645_000,
  heldCents: 387_000,
  releasedCents: 258_000,
  refundedCents: 0,
  funded: true,
  cancelled: false,
  fundingDeadline: 1_796_000_000,
  stages: [
    {
      name: "Stage 1 (materials)",
      amountCents: 258_000,
      state: "Released",
      challengeUntil: 1_795_000_000,
      verificationDeadline: 1_796_000_000,
    },
    {
      name: "Stage 2 (completion)",
      amountCents: 387_000,
      state: "Claimed",
      challengeUntil: 0,
      verificationDeadline: 1_797_000_000,
    },
  ],
  links: [],
};

const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

const STAGE_TEXT: Record<StageState, (s: PublicMoneyState["stages"][number]) => string> = {
  Pending: () => "waiting for the contractor to say the work is done",
  Claimed: (s) =>
    `the contractor says the work is done; waiting for an independent reviewer${s.verificationDeadline ? ` (by ${day(s.verificationDeadline)})` : ""}`,
  Verified: (s) =>
    `checked by an independent reviewer; anyone may challenge it until ${day(s.challengeUntil)}, then it is sent to the contractor`,
  Disputed: () => "challenged; the money stays in the escrow until the dispute is settled",
  Released: () => "sent from the escrow to the contractor's wallet",
  Refunded: () => "returned to the funder",
};

/** The facts, written by code. These are what is shown and all the model may use. */
export function moneyFacts(state: PublicMoneyState): string[] {
  const facts: string[] = [];
  if (state.sample) facts.push("This is a sample case for the demo, not a real escrow.");
  facts.push(`Escrow total: ${formatRand(state.totalCents)} in sandbox demo rand (BDZAR), not real money.`);
  if (state.cancelled) facts.push("The escrow was cancelled.");
  else if (!state.funded) {
    facts.push(`Not funded yet. The funder has until ${day(state.fundingDeadline)} to fill it.`);
  }
  facts.push(`Held in the escrow now: ${formatRand(state.heldCents)}.`);
  facts.push(`Sent to the contractor so far: ${formatRand(state.releasedCents)}.`);
  if (state.refundedCents > 0) facts.push(`Returned to the funder: ${formatRand(state.refundedCents)}.`);
  for (const s of state.stages) {
    facts.push(`${s.name}, ${formatRand(s.amountCents)}: ${STAGE_TEXT[s.state](s)}.`);
  }
  return facts;
}

const WORDS_OF_DECISION =
  /\b(paid|payment (?:is|was) made|approv\w*|resolved|guarantee\w*|authori[sz]\w*|settled)\b/i;

const ReplySchema = z.strictObject({ answer: z.string().trim().min(1).max(500) });

const SYSTEM_PROMPT = `You are Bona AI inside BonaWork. A member of the public asks where the money for a school repair is. Answer only from the FACTS block, which code read from the Solana blockchain.
Rules you must follow:
- ${DATA_RULE}
- Use only what FACTS says. If FACTS does not answer the question, say "The public record does not say." and give the closest fact.
- Use amounts exactly as written in FACTS. Do not add or subtract.
- Never say money was paid, approved or resolved. Say "held in the escrow", "sent to the contractor's wallet" or "returned to the funder", as FACTS does.
- Two or three short sentences a person can listen to. No markdown.
Respond with JSON only: {"answer": string}`;

function ruleAnswer(state: PublicMoneyState): string {
  const facts = moneyFacts(state).filter((f) => !f.startsWith("This is a sample"));
  return facts.slice(1, 4).join(" ");
}

/** Answer a question about one escrow. Never rejects; falls back to the code-written answer. */
export async function answerWhereMoney(
  deps: AiDeps,
  state: PublicMoneyState,
  question: string,
): Promise<MoneyAnswer> {
  const facts = moneyFacts(state);
  const allowed = numbersVouchedBy(facts.join("\n"));
  const { value, source } = await withFallback(
    "where-money",
    deps,
    {
      system: SYSTEM_PROMPT,
      prompt: `${dataBlock("facts", facts.join("\n"))}\n${dataBlock("question", clamp(stripPii(question), 300))}`,
      maxOutputTokens: 250,
    },
    (raw) => {
      const { answer } = parseModelJson(raw, ReplySchema);
      if (inventedNumbers(answer, allowed).length > 0) {
        throw new ModelRefused("the answer has a number that is not in the facts");
      }
      if (WORDS_OF_DECISION.test(answer)) throw new ModelRefused("the answer uses a word of decision");
      return answer;
    },
    () => ruleAnswer(state),
  );
  return { facts, answer: value, source, sample: state.sample, links: state.links };
}
