/**
 * Bona Agent: the shapes that cross the HTTP boundary between the agent
 * components and `/api/agent/*` and `/api/voice/*`, plus the small pieces of
 * arithmetic both sides must agree on (budget and split). Pure: no server,
 * no React, safe to import anywhere.
 *
 * The rule behind every shape here: AI suggests, code and the chain decide.
 * Nothing the agent returns signs, approves, verifies or releases anything.
 */
import { z } from "zod";

/* --------------------------------- Common --------------------------------- */

/** `ai` when a model wrote the suggestion and code accepted it; `rules` when code wrote it. */
export const SuggestionSourceSchema = z.enum(["ai", "rules"]);
export type SuggestionSource = z.infer<typeof SuggestionSourceSchema>;

const Cents = z.number().int().nonnegative().max(100_000_000_00);

/* ------------------------------- Repair Scout ------------------------------ */

export const SCOUT_MAX_REPORT = 2_000;
export const SCOUT_MAX_PARTS = 12;
/** The payment stages of every BonaWork escrow: materials first, the rest on completion. */
export const MATERIALS_SHARE_PERCENT = 40;

export const ScoutRequestSchema = z.object({
  reportText: z.string().trim().min(10, "Say a little more about the problem.").max(SCOUT_MAX_REPORT),
  /** Use the recorded sample prices when live shop prices are not set up. */
  demo: z.boolean().default(false),
});
export type ScoutRequest = z.input<typeof ScoutRequestSchema>;

export const PartKindSchema = z.enum(["material", "service"]);
export type PartKind = z.infer<typeof PartKindSchema>;

export const ScoutOfferSchema = z.object({
  retailer: z.string(),
  url: z.string(),
  title: z.string(),
  priceCents: Cents,
});
export type ScoutOffer = z.infer<typeof ScoutOfferSchema>;

export const ScoutLineSchema = z.object({
  lineId: z.string(),
  description: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(50),
  kind: PartKindSchema,
  /** VAT included. Null when no price was found: the person enters one. */
  unitPriceCents: Cents.nullable(),
  priceSource: z.enum(["shops", "reference_rate", "none", "person"]),
  offers: z.array(ScoutOfferSchema),
  note: z.string(),
});
export type ScoutLine = z.infer<typeof ScoutLineSchema>;

export const BudgetSchema = z.object({
  totalCents: Cents,
  materialsCents: Cents,
  completionCents: Cents,
  /** Lines with no price yet. The budget is not complete until this is 0. */
  unpriced: z.number().int().nonnegative(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const ScoutResultSchema = z.object({
  lines: z.array(ScoutLineSchema),
  budget: BudgetSchema,
  /** Who drafted the parts list. Prices and the budget are always code. */
  partsSource: SuggestionSourceSchema,
  prices: z.object({
    mode: z.enum(["live", "sample", "off"]),
    checkedAt: z.string(),
    sourcesHash: z.string(),
  }),
});
export type ScoutResult = z.infer<typeof ScoutResultSchema>;

/**
 * The budget and its two payment stages, in cents. Code, never a model:
 * the materials stage is 40% rounded down, completion is the rest, so the two
 * always add up to the total exactly.
 */
export function computeBudget(
  lines: readonly Pick<ScoutLine, "quantity" | "unitPriceCents">[],
): Budget {
  let total = 0;
  let unpriced = 0;
  for (const line of lines) {
    if (line.unitPriceCents === null) unpriced += 1;
    else total += line.unitPriceCents * line.quantity;
  }
  const materials = Math.floor((total * MATERIALS_SHARE_PERCENT) / 100);
  return {
    totalCents: total,
    materialsCents: materials,
    completionCents: total - materials,
    unpriced,
  };
}

/* ----------------------------- Reviewer Copilot ---------------------------- */

export const CopilotInvoiceLineSchema = z.object({
  lineId: z.string().min(1).max(64),
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPriceCents: Cents,
});
export type CopilotInvoiceLine = z.infer<typeof CopilotInvoiceLineSchema>;

export const CopilotPriceFlagSchema = z.object({
  lineId: z.string(),
  level: z.enum(["ok", "check", "high", "unavailable"]),
  percentAbove: z.number().int().nullable(),
});
export type CopilotPriceFlag = z.infer<typeof CopilotPriceFlagSchema>;

export const ChecklistRequestSchema = z.object({
  milestone: z.string().trim().min(3).max(1_000),
  stage: z.enum(["materials", "completion"]),
  lines: z.array(CopilotInvoiceLineSchema).max(50),
  priceFlags: z.array(CopilotPriceFlagSchema).max(50).default([]),
});
export type ChecklistRequest = z.input<typeof ChecklistRequestSchema>;

export const CHECK_ID = /^[a-z0-9-]{1,40}$/;

export const ChecklistItemSchema = z.object({
  id: z.string().regex(CHECK_ID),
  text: z.string().min(3).max(240),
  /** The invoice line this check is about; null for a check on the whole job. */
  lineId: z.string().nullable(),
  origin: z.enum(["template", "price_flag", "ai", "reviewer"]),
});
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

export const ChecklistDraftSchema = z.object({
  items: z.array(ChecklistItemSchema),
  /** Who drafted the extra checks. The template and price-flag checks are always code. */
  extraSource: SuggestionSourceSchema,
});
export type ChecklistDraft = z.infer<typeof ChecklistDraftSchema>;

/** One check as the reviewer left it. */
export const ReviewedItemSchema = ChecklistItemSchema.extend({
  result: z.enum(["pass", "fail", "not_checked"]),
  note: z.string().max(500).default(""),
});
export type ReviewedItem = z.input<typeof ReviewedItemSchema>;

export const ReviewRecordSchema = z.object({
  /** Bumped when the canonical shape changes, so old hashes stay explainable. */
  version: z.literal(1),
  caseRef: z.string().min(1).max(80),
  stage: z.enum(["materials", "completion"]),
  milestone: z.string().max(1_000),
  items: z.array(ReviewedItemSchema).min(1).max(40),
  photoWarnings: z.array(z.string().max(300)).max(20).default([]),
  reviewedAt: z.string().max(40),
});
export type ReviewRecord = z.input<typeof ReviewRecordSchema>;

/* ------------------------------ Photo checks ------------------------------ */

export const PhotoFingerprintSchema = z.object({
  name: z.string().max(200),
  /** SHA-256 of the file bytes, 64 hex digits. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** 64-bit difference hash of a 9x8 grey thumbnail, 16 hex digits. Null if the browser could not draw it. */
  dhash: z.string().regex(/^[0-9a-f]{16}$/).nullable(),
  /** EXIF DateTimeOriginal as ISO, when the file has one. */
  takenAt: z.string().max(40).nullable(),
});
export type PhotoFingerprint = z.infer<typeof PhotoFingerprintSchema>;

export const PhotoCheckRequestSchema = z.object({
  caseRef: z.string().min(1).max(80),
  /** When the case was opened (ISO). A photo taken before this gets a warning. */
  caseOpenedAt: z.string().max(40),
  photos: z.array(PhotoFingerprintSchema).min(1).max(20),
});
export type PhotoCheckRequest = z.infer<typeof PhotoCheckRequestSchema>;

export const PhotoWarningSchema = z.object({
  photo: z.string(),
  kind: z.enum(["same_file_other_case", "similar_photo_other_case", "taken_before_case", "no_date"]),
  text: z.string(),
});
export type PhotoWarning = z.infer<typeof PhotoWarningSchema>;

/* --------------------------- Where's the money? --------------------------- */

export const MoneyQuestionSchema = z.object({
  /** The escrow's address on Solana devnet, or "sample" for the labelled sample case. */
  escrow: z.string().min(1).max(64),
  question: z.string().trim().min(2).max(300),
});
export type MoneyQuestion = z.infer<typeof MoneyQuestionSchema>;

export const MoneyAnswerSchema = z.object({
  /** Facts written by code from the chain. Always shown. */
  facts: z.array(z.string()),
  /** The plain answer. Code-checked when a model wrote it. */
  answer: z.string(),
  source: SuggestionSourceSchema,
  sample: z.boolean(),
  links: z.array(z.object({ label: z.string(), href: z.string() })),
});
export type MoneyAnswer = z.infer<typeof MoneyAnswerSchema>;

/* --------------------------------- Voice --------------------------------- */

export const STT_LANGUAGES = {
  en: "English",
  af: "Afrikaans",
  zu: "isiZulu",
  xh: "isiXhosa",
  nso: "Sepedi",
} as const;
export type SttLanguage = keyof typeof STT_LANGUAGES;
export const SttLanguageSchema = z.enum(
  Object.keys(STT_LANGUAGES) as [SttLanguage, ...SttLanguage[]],
);

export const TtsRequestSchema = z.object({
  text: z.string().trim().min(1).max(1_200),
});

/* ------------------------------ Pollar funding ----------------------------- */

export const FundingCheckRequestSchema = z.object({
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/, "Not a Solana signature."),
  funderWallet: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  escrow: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  amountCents: z.number().int().positive(),
});
export type FundingCheckRequest = z.infer<typeof FundingCheckRequestSchema>;

/* ----------------------------- Funding Mandate ----------------------------- */

export const MandateRulesSchema = z.object({
  regions: z.array(z.string().min(1).max(60)).min(1).max(10),
  categories: z.array(z.string().min(1).max(40)).min(1).max(10),
  perCaseCapCents: Cents.refine((v) => v > 0, "Set a cap per case."),
  monthlyCapCents: Cents.refine((v) => v > 0, "Set a monthly cap."),
});
export type MandateRules = z.infer<typeof MandateRulesSchema>;

export const MandateCandidateSchema = z.object({
  id: z.string(),
  school: z.string(),
  region: z.string(),
  category: z.string(),
  budgetCents: Cents,
  summary: z.string(),
  reportedAt: z.string(),
});
export type MandateCandidate = z.infer<typeof MandateCandidateSchema>;

export const MandatePlanSchema = z.object({
  /** In the order to show, with the reason for each. */
  ranked: z.array(
    z.object({
      id: z.string(),
      reason: z.string(),
      fitsCaps: z.boolean(),
      capNote: z.string(),
    }),
  ),
  excluded: z.array(z.object({ id: z.string(), why: z.string() })),
  spentThisMonthCents: Cents,
  source: SuggestionSourceSchema,
  sample: z.boolean(),
});
export type MandatePlan = z.infer<typeof MandatePlanSchema>;
