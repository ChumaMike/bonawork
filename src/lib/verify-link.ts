import { AVALANCHE_CHAINS, BlockchainReceiptSchema, type LedgerEvent } from "@/shared";

/**
 * Links that open BonaBlock Verify (the separate site in `verifier/`) with one
 * record filled in.
 *
 * Everything travels in the URL fragment, the part after `#`. A browser never
 * sends the fragment to a server, so neither BonaBlock nor the verifier's host
 * learns which record is being checked.
 *
 * Fragment format, version 1. Positional fields separated by dots. Empty
 * fields at the end are left off:
 *
 *   #v1.<chain>.<event>.<contract>.<tx>.<report>.<label>.<document>
 *
 *   chain     decimal chain number of the receipt's `eip155:<n>` id, e.g. 43113
 *   event     one letter, see EVENT_CODE below
 *   contract  base64url of the 20 address bytes (27 characters)
 *   tx        base64url of the 32 transaction-hash bytes (43 characters)
 *   report    base64url of the 16 bytes of the report's UUID (22 characters), or empty
 *   label     base64url of the UTF-8 label shown as "Checking: ...", or empty
 *   document  base64url of the UTF-8 JSON of the salted commitment document, or absent
 *
 * base64url is RFC 4648 section 5 without padding. Raw bytes are used instead
 * of hex or JSON so that an ordinary link fits a small square code: about 150
 * characters for an evidence record.
 *
 * The receipt's status, block number and block time are not sent. The verifier
 * reads those from the chain itself.
 *
 * The parser is `verifier/src/lib/link.ts`. The two files share no code, only
 * this format; `verify-link.test.ts` checks them against each other.
 */
export const VERIFY_LINK_VERSION = "v1";

/**
 * A link longer than this leaves the commitment document out. The person then
 * pastes or uploads the document on the verifier. Browsers accept far longer
 * addresses; this keeps a link safe to copy, send and open anywhere.
 */
export const VERIFY_LINK_MAX_LENGTH = 8000;

/** Longest label carried in a link. It is a caption, not something that is checked. */
export const VERIFY_LINK_MAX_LABEL = 80;

/**
 * One letter per ledger event. Part of the format: never reuse or change a letter.
 * E to D are the report flow; W K I G M O L Z are the procurement trail, in trail order.
 */
const EVENT_CODE: Record<LedgerEvent, string> = {
  EvidenceRegistered: "E",
  ReportRegistered: "R",
  ReportAcknowledged: "A",
  InterimProtectionRecorded: "P",
  RepairClaimed: "C",
  RepairVerified: "V",
  RepairDisputed: "D",
  WorkOrderApproved: "W",
  WorkOrderAcknowledged: "K",
  InvoiceSubmitted: "I",
  GoodsReceiptRecorded: "G",
  MatchRecorded: "M",
  PaymentDisputeOpened: "O",
  PaymentDisputeClosed: "L",
  ReleaseAuthorised: "Z",
};

/**
 * Events that anchor no commitment document: a file digest, or nothing at all.
 * Every other event is document-backed, and its link can carry the document:
 * a report, a temporary protection, a repair claim, a review, and on the
 * procurement trail a work order, an invoice, a goods receipt, a match result,
 * a payment dispute and a release decision.
 */
const NO_DOCUMENT: ReadonlySet<LedgerEvent> = new Set([
  "EvidenceRegistered",
  "ReportAcknowledged",
  "WorkOrderAcknowledged",
]);

const PUBLIC_CHAINS: readonly string[] = Object.values(AVALANCHE_CHAINS);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VerifyLinkOptions {
  /** What the record is, in words: "Photo 1 · report BB-2026-000042". */
  label?: string;
  /**
   * The report's id (a UUID, not the BB- reference). The verifier checks that
   * the record on the chain belongs to this report. Anything else is left out.
   */
  reportId?: string;
  /**
   * The salted commitment document, for a record that is not a file: a report,
   * a temporary protection, a repair claim or a review, or a step of the
   * procurement trail. It is carried in the link when the link stays under
   * `VERIFY_LINK_MAX_LENGTH`. Ignored for evidence and acknowledgements.
   *
   * A link is public to whoever it is sent to. The report-flow documents are
   * public anyway (see SECURITY.md). A finance document holds amounts and line
   * detail: pass it only for a viewer who is allowed to read it
   * (`procurement:read`); leave it out and the link still checks the receipt.
   */
  document?: unknown;
}

/**
 * URL that opens BonaBlock Verify with this record filled in, or null when the
 * record is not a confirmed on-chain receipt or NEXT_PUBLIC_VERIFY_URL is not
 * set. The receipt travels in the URL fragment (after #), so it is never sent
 * to a server.
 */
export function verifyLink(
  receipt: unknown,
  opts: VerifyLinkOptions = {},
): string | null {
  const base = verifierBase(process.env.NEXT_PUBLIC_VERIFY_URL);
  if (!base) return null;

  const parsed = BlockchainReceiptSchema.safeParse(receipt);
  if (!parsed.success) return null;
  const { chainId, contractAddress, txId, status, event } = parsed.data;
  // A pending or failed write, or one on the in-memory sample ledger, is not
  // something the chain can vouch for. It gets no link. The link format and
  // the verifier still read only the earlier EVM ledger, so a Solana receipt
  // gets no link yet either.
  if (status !== "confirmed" || !PUBLIC_CHAINS.includes(chainId)) return null;

  const document = documentFor(event, opts.document);
  const documentReportId =
    document && typeof document.reportId === "string" ? document.reportId : null;
  const reportId =
    opts.reportId && UUID.test(opts.reportId.trim())
      ? opts.reportId.trim().toLowerCase()
      : null;

  const head = [
    VERIFY_LINK_VERSION,
    chainId.slice("eip155:".length),
    EVENT_CODE[event],
    base64Url(hexBytes(contractAddress)),
    base64Url(hexBytes(txId)),
  ];
  const report = reportId ? base64Url(hexBytes(reportId.replace(/-/g, ""))) : "";
  const label = base64Url(new TextEncoder().encode(tidyLabel(opts.label)));

  const short = link(base, [...head, report, label]);
  if (!document) return short;
  const full = link(base, [
    ...head,
    // The document names its own report. Sending the id twice only makes the link longer.
    reportId === documentReportId?.toLowerCase() ? "" : report,
    label,
    base64Url(new TextEncoder().encode(JSON.stringify(document))),
  ]);
  return full.length <= VERIFY_LINK_MAX_LENGTH ? full : short;
}

/** The verifier's address without any fragment, or null when it is not an http(s) URL. */
function verifierBase(value: string | undefined): string | null {
  if (!value || !/^https?:\/\//i.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function link(base: string, fields: string[]): string {
  const kept = [...fields];
  while (kept[kept.length - 1] === "") kept.pop();
  return `${base}#${kept.join(".")}`;
}

/** Only document-backed events carry a document, and only a real one (never a sample). */
function documentFor(event: LedgerEvent, value: unknown): Record<string, unknown> | null {
  if (NO_DOCUMENT.has(event)) return null;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  if (typeof document.type !== "string" || typeof document.salt !== "string") return null;
  return document;
}

function tidyLabel(label: string | undefined): string {
  const tidy = (label ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(tidy).slice(0, VERIFY_LINK_MAX_LABEL).join("").trim();
}

function hexBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
