/**
 * Bona AI reads pasted invoice text into fields: a draft the supplier checks
 * and submits. A draft is a suggestion and nothing more: this module has no
 * database and no ledger, and its output has no status or decision field.
 *
 * The model's reply is not trusted. After it answers, code checks every value
 * against the text the model was given:
 *
 * - a string that does not occur in the text becomes null;
 * - a number that the text does not state becomes null;
 * - `missing` is worked out again by code;
 * - line totals and the invoice total are added up again by code, and a
 *   difference is named in `missing`. It is never corrected.
 *
 * A reply with any key the schema does not have (a status, an approval, a
 * note) is refused whole, and a deterministic parser reads the text instead.
 * The same parser answers when AI is off, slow or broken.
 */
import { z } from "zod";
import { InvoiceDraftSchema, type InvoiceDraft, type InvoiceDraftLine } from "@/shared";
import {
  DATA_RULE,
  MAX_INVOICE_TEXT,
  clamp,
  dataBlock,
  numbersVouchedBy,
  parseModelJson,
  randNumber,
  stripPii,
  withFallback,
} from "./guard";
import type { AiDeps } from "./provider";

/** The `missing` entry for an invoice total that is not the sum of its lines. */
export const TOTAL_NOT_SUM_OF_LINES =
  "totalCents: the stated total is not the sum of the lines";

/** The `missing` entry for a line whose quantity times unit price is not its stated line total. */
export const lineTotalFlag = (index: number) =>
  `lines[${index}]: quantity times unit price is not the stated line total`;

const MAX_LINES = 50;

/**
 * What the model must return: the draft's fields plus the line total each
 * line states, so code can add up again. Strict: any other key refuses the reply.
 */
const CandidateLineSchema = z.strictObject({
  sku: z.string().nullable(),
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unitPriceCents: z.number().nullable(),
  lineTotalCents: z.number().nullable(),
});
const CandidateSchema = z.strictObject({
  invoiceNumber: z.string().nullable(),
  orderVersion: z.number().nullable(),
  lines: z.array(CandidateLineSchema).max(MAX_LINES),
  totalCents: z.number().nullable(),
});
type Candidate = z.infer<typeof CandidateSchema>;

const SYSTEM_PROMPT = `You are Bona AI inside BonaWork. A supplier has pasted the text of an invoice. Your only job is to copy what the text states into fields, so the supplier can check them before submitting. You do not judge the invoice and you decide nothing.
Rules you must follow:
- ${DATA_RULE}
- Copy, never guess. A field the text does not state is null. Copy every identifier and description exactly as it is written.
- Money is whole cents: R1 250.00 is 125000. Quantities and the order version are whole numbers.
- "lineTotalCents" is the line total the text states, or null. Calculate nothing: do not add, multiply, or correct a total that looks wrong.
- The answer has exactly the keys below. There is no status, decision, approval, match or note field and you must not add one. You never approve, match, verify, authorise or pay an invoice.
Respond with JSON only: {"invoiceNumber": string|null, "orderVersion": number|null, "lines": [{"sku": string|null, "description": string|null, "quantity": number|null, "unitPriceCents": number|null, "lineTotalCents": number|null}], "totalCents": number|null}.`;

/* ---------------------------- Checking against the text --------------------- */

const squash = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

interface Source {
  squashed: string;
  numbers: ReadonlySet<string>;
}

/** A string survives only if the text literally contains it (case and spacing aside). */
function stated(value: string | null, max: number, source: Source): string | null {
  if (value === null) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > max) return null;
  // A placeholder left by `stripPii` is not something the invoice says.
  if (/\[[a-z ]+ removed\]/i.test(trimmed)) return null;
  return source.squashed.includes(squash(trimmed)) ? trimmed : null;
}

/** A whole number survives only if the text states it. */
function statedCount(value: number | null, source: Source): number | null {
  if (value === null || !Number.isSafeInteger(value) || value <= 0) return null;
  return source.numbers.has(String(value)) ? value : null;
}

/** An amount in cents survives only if the text states it in rand. */
function statedCents(value: number | null, source: Source): number | null {
  if (value === null || !Number.isSafeInteger(value) || value < 0) return null;
  return source.numbers.has(randNumber(value)) ? value : null;
}

/**
 * Turn a candidate (from the model or from the parser) into the draft: keep
 * only what the text states, then work out `missing` and add up again.
 */
function check(candidate: Candidate, text: string): InvoiceDraft {
  const source: Source = { squashed: squash(text), numbers: numbersVouchedBy(text) };
  const lines: InvoiceDraftLine[] = [];
  const lineTotals: Array<number | null> = [];
  for (const line of candidate.lines) {
    const kept: InvoiceDraftLine = {
      sku: stated(line.sku, 64, source),
      description: stated(line.description, 200, source),
      quantity: statedCount(line.quantity, source),
      unitPriceCents: statedCents(line.unitPriceCents, source),
    };
    // A line with nothing the text states is not a line.
    if (Object.values(kept).every((value) => value === null)) continue;
    lines.push(kept);
    lineTotals.push(statedCents(line.lineTotalCents, source));
  }
  const draft = {
    invoiceNumber: stated(candidate.invoiceNumber, 64, source),
    orderVersion: statedCount(candidate.orderVersion, source),
    lines,
    totalCents: statedCents(candidate.totalCents, source),
  };

  const missing: string[] = [];
  if (draft.invoiceNumber === null) missing.push("invoiceNumber");
  if (draft.orderVersion === null) missing.push("orderVersion");
  if (lines.length === 0) missing.push("lines");
  lines.forEach((line, index) => {
    for (const field of ["sku", "description", "quantity", "unitPriceCents"] as const) {
      if (line[field] === null) missing.push(`lines[${index}].${field}`);
    }
  });
  if (draft.totalCents === null) missing.push("totalCents");

  // Add up again. A difference is named, never repaired.
  let sum: number | null = lines.length > 0 ? 0 : null;
  lines.forEach((line, index) => {
    if (line.quantity === null || line.unitPriceCents === null) {
      sum = null;
      return;
    }
    const lineTotal = line.quantity * line.unitPriceCents;
    const statedTotal = lineTotals[index];
    if (statedTotal !== null && statedTotal !== lineTotal)
      missing.push(lineTotalFlag(index));
    if (sum !== null) sum += lineTotal;
  });
  if (sum !== null && draft.totalCents !== null && sum !== draft.totalCents) {
    missing.push(TOTAL_NOT_SUM_OF_LINES);
  }

  return InvoiceDraftSchema.parse({ ...draft, missing });
}

/* ---------------------------- Deterministic parser -------------------------- */

/** `1 250.00`, `1,250.00`, `1250,00`, `1250`: cents after a point or a comma, two digits. */
const MONEY = String.raw`\d{1,3}(?:[ ,]\d{3})+(?:[.,]\d{2})?(?!\d)|\d+(?:[.,]\d{2})?(?!\d)`;
const CURRENCY = String.raw`(?:ZAR|R)?\s?`;
const SKU_LIKE = /^(?=.*[\d-])[A-Za-z0-9][A-Za-z0-9._/#-]{0,63}$/;
const SUMMARY_ROW = /^(?:sub\s*-?\s*total|grand\s+total|total|vat|tax|amount|balance)\b/i;

const TOTAL_ROW = new RegExp(
  String.raw`^(?:grand\s+|invoice\s+)?total(?:\s+(?:due|amount|payable))?\s*[:=]?\s*${CURRENCY}(${MONEY})$`,
  "i",
);
/** `TAP-01 Brass tap 4 x R120.00 = R480.00`: the multiplication sign or `@` marks the columns. */
const LINE_WITH_SIGN = new RegExp(
  String.raw`^(.+?)\s+(\d+)\s*(?:x|×|@|\*)\s*${CURRENCY}(${MONEY})(?:\s*=?\s*${CURRENCY}(${MONEY}))?$`,
  "i",
);
/** `TAP-01 Brass tap 4 R120.00 R480.00`: the currency sign marks the amounts. */
const LINE_WITH_CURRENCY = new RegExp(
  String.raw`^(.+?)\s+(\d+)\s+(?:ZAR|R)\s?(${MONEY})(?:\s+(?:ZAR|R)\s?(${MONEY}))?$`,
  "i",
);

function toCents(money: string): number {
  const [, whole, cents = "0"] = /^(.*?)(?:[.,](\d{2}))?$/.exec(money) ?? [];
  return Number((whole ?? "").replace(/[ ,]/g, "")) * 100 + Number(cents);
}

function moneyCell(cell: string): number | null {
  const match = new RegExp(String.raw`^${CURRENCY}(${MONEY})$`, "i").exec(cell);
  return match ? toCents(match[1]) : null;
}

/** Split `TAP-01 Brass tap` into an identifier and a description, when the first word looks like one. */
function nameOf(text: string): { sku: string | null; description: string | null } {
  const [first, ...rest] = text.trim().split(/\s+/);
  if (rest.length > 0 && SKU_LIKE.test(first)) {
    return { sku: first, description: rest.join(" ") };
  }
  return { sku: null, description: text.trim() || null };
}

function parseLine(row: string): Candidate["lines"][number] | null {
  // Columns marked by pipes, tabs or runs of spaces.
  const cells = row
    .split(/\s*\|\s*|\t+|\s{2,}/)
    .map((cell) => cell.trim())
    .filter(Boolean);
  if (cells.length >= 4 && /^\d+$/.test(cells[2])) {
    const unit = moneyCell(cells[3]);
    if (unit !== null) {
      return {
        sku: cells[0],
        description: cells[1],
        quantity: Number(cells[2]),
        unitPriceCents: unit,
        lineTotalCents: cells[4] ? moneyCell(cells[4]) : null,
      };
    }
  }
  const match = LINE_WITH_SIGN.exec(row) ?? LINE_WITH_CURRENCY.exec(row);
  if (!match) return null;
  return {
    ...nameOf(match[1]),
    quantity: Number(match[2]),
    unitPriceCents: toCents(match[3]),
    lineTotalCents: match[4] ? toCents(match[4]) : null,
  };
}

/**
 * Read an invoice without a model: an invoice number, an order version, rows
 * that look like `identifier description quantity price [line total]`, and a
 * total on a row of its own. What it cannot read stays null.
 */
export function parseInvoiceText(text: string): Candidate {
  const rows = text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
  const invoiceNumber =
    /\binvoice\s*(?:no\.?|number|nr\.?|num\.?|#)\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9._/#-]{0,63})/i.exec(
      text,
    )?.[1] ??
    /\b(INV[-/]?\d[A-Za-z0-9._/-]{0,59})\b/i.exec(text)?.[1] ??
    null;
  const version =
    /\b(?:order\s+)?version\s*[:#]?\s*(\d{1,4})\b/i.exec(text)?.[1] ??
    /\border\b[^\n]*?\bv(\d{1,4})\b/i.exec(text)?.[1] ??
    null;

  let totalCents: number | null = null;
  const lines: Candidate["lines"] = [];
  for (const row of rows) {
    const total = TOTAL_ROW.exec(row);
    if (total) {
      totalCents = toCents(total[1]);
      continue;
    }
    if (SUMMARY_ROW.test(row) || lines.length >= MAX_LINES) continue;
    const line = parseLine(row);
    if (line) lines.push(line);
  }
  return {
    invoiceNumber,
    orderVersion: version === null ? null : Number(version),
    lines,
    totalCents,
  };
}

/* ----------------------------------- Draft ---------------------------------- */

/**
 * Read invoice text into a draft. Writes nothing and decides nothing: the
 * result is a suggestion for the supplier to check, and every value in it was
 * found in the text by code.
 */
export async function draftInvoice(
  deps: AiDeps,
  input: { text: string },
): Promise<InvoiceDraft> {
  // Contact details and ID numbers are removed before a model sees the text.
  const text = clamp(stripPii(input.text.trim()), MAX_INVOICE_TEXT);
  const { value } = await withFallback(
    "invoice-draft",
    deps,
    {
      system: SYSTEM_PROMPT,
      prompt: `Copy the fields out of this invoice text.\n${dataBlock("invoice_text", text)}`,
      maxOutputTokens: 2_000,
    },
    (raw) => parseModelJson(raw, CandidateSchema),
    () => parseInvoiceText(text),
  );
  return check(value, text);
}
