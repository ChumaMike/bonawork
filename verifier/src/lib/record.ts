import { DOCUMENT_FIELDS, documentProblems, isRecord, isUuid } from "./canonical";
import { LINK_VERSION, readVerifyFragment, type VerifyLink } from "./link";
import {
  isSampleReceipt,
  modeForEvent,
  receiptTextFromScan,
  type Mode,
} from "./receipt-text";
import { EVENT_RULE, REGISTRY_EVENTS, type RegistryEvent } from "./verify";

/**
 * Works out what a person handed over: a link, a pasted receipt, a sample, or
 * the wrong thing. The page uses this so nobody has to say what kind of record
 * they hold or type a report id.
 */

/** One record, ready to be checked once the person adds what only they hold. */
export interface RecordToCheck {
  /** The receipt as BonaBlock wrote it, or the fields a link carried. */
  receipt: unknown;
  event: RegistryEvent;
  /** What the person must supply next: a file, a document, or nothing. */
  mode: Mode;
  /** A caption from the link. Shown, never checked. */
  label?: string;
  /** The report's UUID, when the link carried one. */
  reportId?: string;
  /** The commitment document, when the link or the pasted text carried one. */
  document?: Record<string, unknown>;
  /** The link had a document that could not be read. */
  documentDamaged?: boolean;
}

export type RecordRead =
  | { kind: "empty" }
  | { kind: "record"; record: RecordToCheck }
  /** From BonaBlock's practice data or its in-memory ledger: nothing on any network. */
  | { kind: "sample"; receipt: unknown }
  /** The record's details were pasted where the receipt goes. */
  | { kind: "document" }
  | { kind: "unreadable" };

function knownEvent(value: unknown): RegistryEvent | null {
  return typeof value === "string" &&
    (REGISTRY_EVENTS as readonly string[]).includes(value)
    ? (value as RegistryEvent)
    : null;
}

/** A record from a BonaBlock Verify link that has already been parsed. */
export function recordFromLink(link: VerifyLink): RecordRead {
  const event = knownEvent(link.receipt.event);
  if (!event) return { kind: "unreadable" };
  const mode = modeForEvent(event);
  const record: RecordToCheck = { receipt: link.receipt, event, mode };
  if (link.label) record.label = link.label;
  if (link.reportId && isUuid(link.reportId)) record.reportId = link.reportId;
  if (mode === "document") {
    if (link.document) record.document = link.document;
    if (link.documentDamaged) record.documentDamaged = true;
  }
  return { kind: "record", record };
}

/** A record from receipt JSON, as copied in BonaBlock. */
export function recordFromJson(value: unknown): RecordRead {
  if (!isRecord(value)) return { kind: "unreadable" };
  // The sample check comes first: a sample receipt names no event at all.
  if (isSampleReceipt(value)) return { kind: "sample", receipt: value };

  const event = knownEvent(value.event);
  if (event) {
    return {
      kind: "record",
      record: { receipt: value, event, mode: modeForEvent(event) },
    };
  }

  // A receipt and its document copied together: `{ receipt, document }`.
  if (isRecord(value.receipt)) {
    const inner = recordFromJson(value.receipt);
    if (
      inner.kind === "record" &&
      inner.record.mode === "document" &&
      isRecord(value.document) &&
      value.document.sample !== true
    ) {
      inner.record.document = value.document;
    }
    return inner;
  }

  if (typeof value.type === "string" && value.type in DOCUMENT_FIELDS) {
    return { kind: "document" };
  }
  return { kind: "unreadable" };
}

/**
 * Read whatever arrived by paste, upload, scan or URL fragment: a BonaBlock
 * Verify link, or receipt JSON with anything around it. Never throws.
 */
export function readRecord(input: string): RecordRead {
  const text = input.trim();
  if (!text) return { kind: "empty" };

  const linkAt = text.indexOf(`#${LINK_VERSION}.`);
  if (linkAt >= 0 || text.startsWith(`${LINK_VERSION}.`)) {
    const fragment = linkAt >= 0 ? (text.slice(linkAt).split(/\s/)[0] ?? "") : text;
    const read = readVerifyFragment(fragment);
    return read.kind === "link" ? recordFromLink(read.link) : { kind: "unreadable" };
  }

  try {
    return recordFromJson(JSON.parse(receiptTextFromScan(text)));
  } catch {
    return { kind: "unreadable" };
  }
}

/* --------------------------- Commitment documents ---------------------------- */

const DOCUMENT_NAME: Record<string, string> = {
  report: "a report",
  interim_protection: "a temporary protection",
  repair_claim: "a repair claim",
  review: "a review",
  work_order: "a work order",
  supplier_invoice: "a supplier invoice",
  goods_receipt: "a goods receipt",
  match_result: "a three-way match result",
  release_decision: "a release authorisation",
};

export type DocumentRead =
  | { ok: true; document: Record<string, unknown> }
  /** `problem` is for the person; `detail` is the precise reason, for Technical details. */
  | { ok: false; problem: string; detail?: string };

/**
 * Check that a value is the commitment document this receipt needs. These are
 * the rules `verify.ts` applies, said in plain words before anything is sent.
 */
export function checkDocument(value: unknown, event: RegistryEvent): DocumentRead {
  let doc = value;
  // `{ receipt, document }` copied together: use the document inside.
  if (isRecord(doc) && doc.type === undefined && isRecord(doc.document)) {
    doc = doc.document;
  }

  if (isRecord(doc) && doc.sample === true) {
    return {
      ok: false,
      problem:
        "These details are a sample from Bona Chain's practice data. They were never recorded, so there is nothing to check.",
    };
  }
  if (
    isRecord(doc) &&
    doc.type === undefined &&
    (doc.txId !== undefined || doc.event !== undefined)
  ) {
    return {
      ok: false,
      problem:
        "That is the receipt again. This step needs the record's details: in Bona Chain, tap Copy document on the same record.",
    };
  }
  const detail = documentProblems(doc);
  if (detail) {
    return {
      ok: false,
      problem:
        "These are not the full details of a Bona Chain record. In Bona Chain, tap Copy document on the same record and try again.",
      detail,
    };
  }
  const document = doc as Record<string, unknown>;
  const needed = EVENT_RULE[event].document;
  if (needed && document.type !== needed) {
    return {
      ok: false,
      problem: `These details are for ${DOCUMENT_NAME[String(document.type)] ?? "another kind of record"}, but the receipt is for ${DOCUMENT_NAME[needed]}. Copy the document from the same record as the receipt.`,
      detail: `A ${event} receipt needs a "${needed}" document, but this one is "${String(document.type)}".`,
    };
  }
  const outcome =
    event === "RepairVerified"
      ? "verified"
      : event === "RepairDisputed"
        ? "disputed"
        : null;
  if (
    event === "MatchRecorded" &&
    document.outcome !== "pass" &&
    document.outcome !== "fail"
  ) {
    return {
      ok: false,
      problem:
        "These details do not say whether the match passed. Copy the document from the same record as the receipt.",
      detail: `A MatchRecorded receipt needs a match result with outcome "pass" or "fail", not "${String(document.outcome)}".`,
    };
  }
  if (outcome && document.outcome !== outcome) {
    return {
      ok: false,
      problem:
        "These details are for a different review from the receipt. Copy the document from the same record as the receipt.",
      detail: `A ${event} receipt needs a review with outcome "${outcome}", not "${String(document.outcome)}".`,
    };
  }
  return { ok: true, document };
}

/** Read pasted or uploaded document text. */
export function readDocument(input: string, event: RegistryEvent): DocumentRead {
  let value: unknown;
  try {
    value = JSON.parse(receiptTextFromScan(input));
  } catch (error) {
    return {
      ok: false,
      problem:
        "That is not the record's details. In Bona Chain, tap Copy document on the same record, then paste here.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  return checkDocument(value, event);
}

/** The words of a commitment document that a person can read back, in a fixed order. */
export function documentWords(
  document: Record<string, unknown>,
): { name: string; text: string }[] {
  const names: [string, string][] = [
    ["title", "Title"],
    ["description", "Description"],
    ["category", "Category"],
    ["measure", "What was put in place"],
    ["summary", "What was done"],
    ["invoiceNumber", "Invoice number"],
    ["outcome", "Outcome"],
    ["decision", "Decision"],
    ["findings", "Findings"],
    ["createdAt", "Written"],
  ];
  const words: { name: string; text: string }[] = [];
  for (const [key, name] of names) {
    const value = document[key];
    if (typeof value === "string" && value.trim()) words.push({ name, text: value });
  }
  // A finance document: how many lines it lists and its total, read from the
  // document on this device. Money is whole cents in the document.
  const written = words.findIndex((word) => word.name === "Written");
  const at = written >= 0 ? written : words.length;
  const extra: { name: string; text: string }[] = [];
  if (Array.isArray(document.lines)) {
    const count = document.lines.length;
    extra.push({ name: "Lines", text: `${count} ${count === 1 ? "line" : "lines"}` });
  }
  if (typeof document.totalCents === "number" && Number.isFinite(document.totalCents)) {
    const currency = typeof document.currency === "string" ? document.currency : "";
    extra.push({
      name: "Total",
      text: `${currency} ${(document.totalCents / 100).toFixed(2)}`.trim(),
    });
  }
  words.splice(at, 0, ...extra);
  return words;
}
