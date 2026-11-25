/**
 * The review hash: SHA-256 of the canonical JSON of a finished review. The
 * browser shows it to the reviewer before signing, and the server computes the
 * same bytes for `review_hash`. Pure; runs in Node and browsers.
 */
import { canonicalJson, sha256Hex } from "@/shared/commitment";
import { ReviewRecordSchema, type ReviewRecord } from "./contracts";

/**
 * Validated, text trimmed, keys sorted, no whitespace. Item order is kept: it
 * is the order the reviewer saw.
 */
export function canonicalReview(record: ReviewRecord): string {
  const parsed = ReviewRecordSchema.parse(record);
  return canonicalJson({
    ...parsed,
    caseRef: parsed.caseRef.trim(),
    milestone: parsed.milestone.trim(),
    items: parsed.items.map((item) => ({
      ...item,
      text: item.text.trim(),
      note: item.note.trim(),
    })),
    photoWarnings: parsed.photoWarnings.map((w) => w.trim()),
  });
}

/** SHA-256 of the canonical review, as `0x` + 64 hex digits. */
export function reviewHashHex(record: ReviewRecord): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonicalReview(record)));
}

/** The 32 bytes the BonaWork program stores as `review_hash`. */
export async function reviewHash(record: ReviewRecord): Promise<Uint8Array> {
  const hex = (await reviewHashHex(record)).slice(2);
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
