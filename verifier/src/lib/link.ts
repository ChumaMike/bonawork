/**
 * Reads a BonaBlock Verify link: the record a person wants to check, carried
 * in the URL fragment (the part after `#`). A browser never sends the fragment
 * to a server, so opening a link tells no server which record it is.
 *
 * Fragment format, version 1. Positional fields separated by dots. Empty
 * fields at the end may be left off:
 *
 *   #v1.<chain>.<event>.<contract>.<tx>.<report>.<label>.<document>
 *
 *   chain     decimal chain number of the receipt's `eip155:<n>` id, e.g. 43113
 *   event     one letter, see EVENT_BY_CODE below
 *   contract  base64url of the 20 address bytes
 *   tx        base64url of the 32 transaction-hash bytes
 *   report    base64url of the 16 bytes of the report's UUID, or empty
 *   label     base64url of the UTF-8 caption shown as "Checking: ...", or empty
 *   document  base64url of the UTF-8 JSON of the salted commitment document, or absent
 *
 * base64url is RFC 4648 section 5 without padding.
 *
 * BonaBlock builds these links in its own `src/lib/verify-link.ts`. This file
 * imports nothing, from BonaBlock or anywhere else: the format above is the
 * only thing the two sides share.
 */
export const LINK_VERSION = "v1";

/** One letter per registry event. Part of the format. */
export const EVENT_BY_CODE: Readonly<Record<string, string>> = {
  E: "EvidenceRegistered",
  R: "ReportRegistered",
  A: "ReportAcknowledged",
  P: "InterimProtectionRecorded",
  C: "RepairClaimed",
  V: "RepairVerified",
  D: "RepairDisputed",
};

/** A link may carry a whole commitment document, but nothing near this size is a real one. */
const MAX_FRAGMENT_LENGTH = 64_000;
const MAX_LABEL_LENGTH = 80;

export interface VerifyLink {
  /** The fields of BonaBlock's receipt that the ledger check needs. */
  receipt: { chainId: string; contractAddress: string; txId: string; event: string };
  /** A caption supplied by whoever made the link. Shown, never checked. */
  label?: string;
  /** The report's UUID. */
  reportId?: string;
  /** The salted commitment document, parsed. */
  document?: Record<string, unknown>;
  /** The link had a document field that could not be read, for example because the link was cut short. */
  documentDamaged?: boolean;
}

export type FragmentRead =
  /** No fragment at all: the site was opened plainly. */
  | { kind: "none" }
  | { kind: "link"; link: VerifyLink }
  /** An older style of link: the receipt's JSON text itself after the `#`. */
  | { kind: "json"; text: string }
  /** There is a fragment, but it is not a record this site understands. */
  | { kind: "unreadable" };

/**
 * Read a fragment (`#v1...`, with or without the `#`) or a whole link. Never throws.
 */
export function readVerifyFragment(input: string): FragmentRead {
  const text = input.trim();
  const hashAt = text.indexOf("#");
  const fragment = hashAt >= 0 ? text.slice(hashAt + 1) : text;
  if (!fragment) return { kind: "none" };
  if (fragment.length > MAX_FRAGMENT_LENGTH) return { kind: "unreadable" };

  if (!fragment.startsWith(`${LINK_VERSION}.`)) {
    const json = legacyJson(fragment);
    return json ? { kind: "json", text: json } : { kind: "unreadable" };
  }

  const fields = fragment.split(".");
  const chain = fields[1] ?? "";
  const event = EVENT_BY_CODE[fields[2] ?? ""];
  const contract = bytesFrom(fields[3] ?? "");
  const tx = bytesFrom(fields[4] ?? "");
  if (!/^[1-9][0-9]{0,15}$/.test(chain) || !event) return { kind: "unreadable" };
  if (contract?.length !== 20 || tx?.length !== 32) return { kind: "unreadable" };

  const link: VerifyLink = {
    receipt: {
      chainId: `eip155:${chain}`,
      contractAddress: `0x${hex(contract)}`,
      txId: `0x${hex(tx)}`,
      event,
    },
  };

  const report = fields[5] ?? "";
  if (report) {
    const bytes = bytesFrom(report);
    if (bytes?.length !== 16) return { kind: "unreadable" };
    const h = hex(bytes);
    link.reportId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  const label = tidyLabel(textFrom(fields[6] ?? "") ?? "");
  if (label) link.label = label;

  const documentField = fields[7] ?? "";
  if (documentField) {
    const document = parseObject(textFrom(documentField));
    if (document) link.document = document;
    else link.documentDamaged = true;
  }

  return { kind: "link", link };
}

function legacyJson(fragment: string): string | null {
  let text = fragment;
  try {
    text = decodeURIComponent(fragment);
  } catch {
    // Not percent-encoded: use it as it is.
  }
  text = text.trim();
  return text.startsWith("{") && text.endsWith("}") ? text : null;
}

function bytesFrom(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length % 4 === 1) return null;
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function textFrom(field: string): string | null {
  if (!field) return null;
  const bytes = bytesFrom(field);
  if (!bytes) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function parseObject(text: string | null): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** A caption from a link is untrusted text: one line, no control characters, not long. */
function tidyLabel(label: string): string {
  const tidy = label
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(tidy).slice(0, MAX_LABEL_LENGTH).join("").trim();
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}
