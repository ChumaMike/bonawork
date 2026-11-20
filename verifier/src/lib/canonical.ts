/**
 * Local re-implementation of the hashing rules BonaBlock uses. These are
 * deliberately NOT imported from `src/shared` — the verifier must not share
 * code with the system it checks. If the rules there change, this file is the
 * one place to update. Runs in Node and in the browser (Web Crypto only).
 */

/** `0x` + 64 lower-case hex characters: a bytes32 as the app writes it. */
export type Hex32 = `0x${string}`;

const HEX32 = /^(0[xX])?[0-9a-fA-F]{64}$/;

/** Normalise a 32-byte hex value to `0x` + lower-case, or null if malformed. */
export function normaliseHex32(value: string): Hex32 | null {
  const trimmed = value.trim();
  if (!HEX32.test(trimmed)) return null;
  return `0x${trimmed.replace(/^0[xX]/, "").toLowerCase()}`;
}

/** SHA-256 of raw bytes as `0x` + lower-case hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<Hex32> {
  const hash = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  const hex = Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `0x${hex}`;
}

/**
 * Deterministic JSON: object keys sorted by code unit (recursively), no
 * whitespace, `undefined` properties dropped. Identical to BonaBlock's
 * `canonicalJson`.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/* --------------------------- Commitment documents ---------------------------- */

/**
 * The on-chain commitment for a report, interim protection, repair claim or
 * review is SHA-256 of the canonical JSON of a *salted document*. To check
 * one you need the document, salt included. These are the exact field sets
 * of BonaBlock's `*DocumentSchema`s; unknown keys are ignored, as the app's
 * schema validation strips them before hashing.
 */
export const DOCUMENT_FIELDS = {
  report: [
    "type",
    "reportId",
    "institutionId",
    "category",
    "title",
    "description",
    "createdAt",
    "salt",
  ],
  interim_protection: [
    "type",
    "protectionId",
    "reportId",
    "measure",
    "createdAt",
    "salt",
  ],
  repair_claim: [
    "type",
    "claimId",
    "reportId",
    "summary",
    "evidenceDigests",
    "createdAt",
    "salt",
  ],
  review: [
    "type",
    "reviewId",
    "reportId",
    "claimId",
    "outcome",
    "findings",
    "evidenceDigests",
    "createdAt",
    "salt",
  ],
} as const;

export type DocumentType = keyof typeof DOCUMENT_FIELDS;

export const DOCUMENT_TYPES = Object.keys(DOCUMENT_FIELDS) as DocumentType[];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Why a value is not a hashable commitment document, or null if it is. */
export function documentProblems(doc: unknown): string | null {
  if (!isRecord(doc)) return "The commitment document must be a JSON object.";
  const type = doc.type;
  if (typeof type !== "string" || !(type in DOCUMENT_FIELDS)) {
    return `The document's "type" must be one of ${DOCUMENT_TYPES.join(", ")}.`;
  }
  const missing = DOCUMENT_FIELDS[type as DocumentType].filter(
    (k) => doc[k] === undefined,
  );
  if (missing.length > 0) {
    return `The ${type} document is missing field(s): ${missing.join(", ")}. The salt is required: without it the commitment cannot be recomputed.`;
  }
  if (typeof doc.salt !== "string" || !HEX32.test(doc.salt)) {
    return "The document's salt must be a 32-byte hex value.";
  }
  return null;
}

/** Keep exactly the committed fields of a document. */
export function pickDocumentFields(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const type = doc.type as DocumentType;
  const out: Record<string, unknown> = {};
  for (const key of DOCUMENT_FIELDS[type]) out[key] = doc[key];
  return out;
}

/** `commitment` = SHA-256 of the canonical JSON of the document. Mirrors BonaBlock's `computeCommitment`. */
export function computeCommitment(doc: Record<string, unknown>): Promise<Hex32> {
  return sha256Hex(new TextEncoder().encode(canonicalJson(pickDocumentFields(doc))));
}

/* --------------------------------- Identifiers -------------------------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value.trim());
}

/**
 * BonaBlock's `idToBytes32(uuid)`: the UUID's 16 bytes in the low half of a
 * bytes32, zeros in the high half. Used for `reportId` and `schoolId`.
 */
export function idToBytes32(uuid: string): Hex32 {
  const trimmed = uuid.trim();
  if (!UUID.test(trimmed)) throw new Error(`Not a UUID: ${trimmed}`);
  return `0x${"0".repeat(32)}${trimmed.replace(/-/g, "").toLowerCase()}`;
}
