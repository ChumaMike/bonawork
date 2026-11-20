/**
 * DEVELOPMENT FIXTURE for the invoice draft.
 *
 * A small, deterministic reader of pasted invoice text, so the "Draft with
 * Bona AI" button can be designed and tested without an AI service. It is not
 * a language model. It follows the same rule the real draft must follow: a
 * field the text does not state is null and named in `missing`. Nothing is
 * guessed, corrected or filled in from the order.
 *
 * It understands labelled lines and line rows:
 *
 *   Invoice number: INV-2042
 *   Order version: 1
 *   3 x [LOCK-3L] Three-lever mortice lockset @ R 685.00
 *   Total: R 5 885.00
 */
import { parseQuantity, parseRand } from "@/features/procurement/money";
import type { InvoiceDraft, InvoiceDraftLine } from "../types";

const INVOICE_NUMBER = /^\s*invoice\s*(?:number|no\.?|#)\s*[:#-]\s*(\S.*)$/i;
const ORDER = /^\s*(?:work\s+)?order\b([^:]*):\s*(.*)$/i;
const TOTAL = /^\s*(?:invoice\s+)?total(?:\s+due)?\s*:\s*(\S.*)$/i;
/** `3 x description @ price`. The quantity and the price are checked afterwards. */
const ROW = /^\s*(?:(\d+)\s*[x×]|(\S+)\s+[x×])\s+(.+)$/i;

function readRow(line: string): InvoiceDraftLine | null {
  const row = ROW.exec(line);
  if (!row) return null;
  const rest = row[3];
  const at = rest.lastIndexOf("@");
  const words = (at === -1 ? rest : rest.slice(0, at)).trim();
  const price = at === -1 ? "" : rest.slice(at + 1);
  const coded = /^\[([^\]]+)\]\s*(.*)$/.exec(words);
  const quantity = parseQuantity(row[1] ?? row[2], 1);
  return {
    sku: coded ? coded[1].trim() || null : null,
    description: (coded ? coded[2] : words).trim() || null,
    quantity,
    unitPriceCents: parseRand(price),
  };
}

function readOrderVersion(label: string, value: string): number | null {
  // "Order version: 1" and "Order: BB-2026-000142, version 1". A bare
  // "Order: 1" is a reference, not a version, and stays unread.
  const stated = /\b(?:version|v)[\s:#.]*(\d+)\b/i.exec(`${label}: ${value}`);
  return stated ? Number(stated[1]) || null : null;
}

export function draftInvoiceFromText(text: string): InvoiceDraft {
  let invoiceNumber: string | null = null;
  let orderVersion: number | null = null;
  let totalCents: number | null = null;
  const lines: InvoiceDraftLine[] = [];

  for (const line of text.split(/\r?\n/)) {
    const number = INVOICE_NUMBER.exec(line);
    if (number) {
      invoiceNumber ??= number[1].trim().slice(0, 64) || null;
      continue;
    }
    const total = TOTAL.exec(line);
    if (total) {
      totalCents ??= parseRand(total[1]);
      continue;
    }
    const order = ORDER.exec(line);
    if (order) {
      orderVersion ??= readOrderVersion(order[1], order[2]);
      continue;
    }
    const row = readRow(line);
    if (row) lines.push(row);
  }

  const missing: string[] = [];
  if (invoiceNumber === null) missing.push("invoiceNumber");
  if (orderVersion === null) missing.push("orderVersion");
  if (lines.length === 0) missing.push("lines");
  lines.forEach((line, index) => {
    for (const field of ["sku", "description", "quantity", "unitPriceCents"] as const) {
      if (line[field] === null) missing.push(`lines[${index}].${field}`);
    }
  });
  if (totalCents === null) missing.push("totalCents");

  return { invoiceNumber, orderVersion, lines, totalCents, missing };
}
