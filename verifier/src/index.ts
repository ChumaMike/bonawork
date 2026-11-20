import { createHash, timingSafeEqual } from "node:crypto";

/** Lower-case hex SHA-256 digest of the exact evidence bytes. */
export function digestEvidence(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type VerificationResult =
  | { status: "match"; digest: string }
  | { status: "mismatch"; digest: string; expected: string }
  | { status: "invalid-expected-digest"; expected: string };

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Recompute the digest of `bytes` and compare it with the digest read from the
 * ledger. The caller fetches `expectedDigest` from the chain directly — never
 * from the Gcina web app — which is what makes this check independent.
 */
export function verifyEvidence(
  bytes: Uint8Array,
  expectedDigest: string,
): VerificationResult {
  const expected = expectedDigest.trim().toLowerCase().replace(/^0x/, "");
  if (!SHA256_HEX.test(expected)) {
    return { status: "invalid-expected-digest", expected: expectedDigest };
  }
  const digest = digestEvidence(bytes);
  const same = timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(expected, "hex"));
  return same ? { status: "match", digest } : { status: "mismatch", digest, expected };
}
