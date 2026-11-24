import { canonicalJson, sha256Hex } from "../commitment";
import type { Hex32 } from "../primitives";
import type { PriceCheckAssessment } from "./types";

/**
 * The price check's fingerprint, for the committed procurement manifest.
 * `canonicalJson` is the one in `../commitment`: keys sorted, no whitespace,
 * undefined fields dropped. Re-exported so callers need one import.
 */
export { canonicalJson };

/** SHA-256 of the canonical JSON of any value, as `0x` + 64 hex digits. */
export function hashCanonical(value: unknown): Promise<Hex32> {
  return sha256Hex(new TextEncoder().encode(canonicalJson(value)));
}

/** The `sourcesHash` of a price check: the hash of everything in it except the hash. */
export function hashAssessment(assessment: PriceCheckAssessment): Promise<Hex32> {
  const { lines, overall, checkedAt } = assessment;
  return hashCanonical({ lines, overall, checkedAt });
}
