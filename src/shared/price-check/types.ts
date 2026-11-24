import { z } from "zod";
import { CentsSchema } from "../procurement/base";

/**
 * Price check: compares invoice lines with current South African shop prices.
 *
 * It is a warning for people to read, never an approval and never a block. A
 * price gap is a risk sign, not proof: labour, delivery, VAT or a different
 * specification can explain it. When no shop price can be found the line is
 * `unavailable`, and the three-way match goes on exactly as before.
 */

export const PRICE_LEVELS = ["ok", "check", "high", "unavailable"] as const;
export const PriceLevelSchema = z.enum(PRICE_LEVELS);
export type PriceLevel = z.infer<typeof PriceLevelSchema>;

/** `material` lines are compared with shop prices; `service` lines (labour) never are. */
export const PriceCheckLineKindSchema = z.enum(["material", "service"]);
export type PriceCheckLineKind = z.infer<typeof PriceCheckLineKindSchema>;

/** One invoice line as the price check reads it. */
export const PriceCheckLineSchema = z.object({
  /** The invoice line's `sku`. */
  lineId: z.string().min(1).max(64),
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive(),
  unitPriceCents: CentsSchema,
  /** True when `unitPriceCents` already includes 15% VAT. Shop prices always do. */
  vatInclusive: z.boolean(),
  kind: PriceCheckLineKindSchema.default("material"),
});
export type PriceCheckLine = z.input<typeof PriceCheckLineSchema>;

export const PriceCheckInvoiceSchema = z.object({
  lines: z.array(PriceCheckLineSchema).min(1).max(50),
});
export type PriceCheckInvoice = z.input<typeof PriceCheckInvoiceSchema>;

/** A shop price found for a line. Prices include VAT, as South African shop prices do. */
export const PriceOfferSchema = z.object({
  retailer: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  priceCents: CentsSchema,
});
export type PriceOffer = z.infer<typeof PriceOfferSchema>;

/** An offer with the time it was read, as `compareLine` takes it. */
export const CandidateOfferSchema = PriceOfferSchema.extend({
  fetchedAt: z.string(),
});
export type CandidateOffer = z.infer<typeof CandidateOfferSchema>;

export const PriceCheckLineResultSchema = z.object({
  lineId: z.string(),
  level: PriceLevelSchema,
  /** Median shop price in cents, VAT included; null when `unavailable`. */
  medianCents: CentsSchema.nullable(),
  /** Whole percent the VAT-inclusive invoice unit price is above the median (negative = below). */
  percentAbove: z.number().int().nullable(),
  offers: z.array(PriceOfferSchema),
  /** A plain-English sentence for the reader. */
  note: z.string(),
});
export type PriceCheckLineResult = z.infer<typeof PriceCheckLineResultSchema>;

export const PriceCheckResultSchema = z.object({
  lines: z.array(PriceCheckLineResultSchema),
  /** The worst level among compared lines; `unavailable` when no line could be compared. */
  overall: PriceLevelSchema,
  checkedAt: z.string(),
  /** `hashAssessment` of everything above: SHA-256 of its canonical JSON. */
  sourcesHash: z.string().regex(/^0x[0-9a-f]{64}$/),
});
export type PriceCheckResult = z.infer<typeof PriceCheckResultSchema>;

/** The result before it is hashed. */
export type PriceCheckAssessment = Omit<PriceCheckResult, "sourcesHash">;
