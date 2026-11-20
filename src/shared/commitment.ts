import type { CommitmentDocument } from "./domain";
import type { Hex32 } from "./primitives";

const utf8 = (text: string) => new TextEncoder().encode(text);
const toHex32 = (bytes: Uint8Array): Hex32 =>
  `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;

/** SHA-256 of raw bytes. Uses Web Crypto, so it runs in Node and browsers. */
export async function sha256Hex(bytes: Uint8Array): Promise<Hex32> {
  const hash = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return toHex32(new Uint8Array(hash));
}

/**
 * Deterministic JSON: object keys sorted, no whitespace. Two parties that
 * hold the same data always produce the same string, and so the same digest.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A fresh random 32-byte salt for a commitment document. */
export function newSalt(): Hex32 {
  return toHex32(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * The value written on-chain for a report, interim protection, repair claim
 * or review: SHA-256 of the document's canonical JSON. The document carries
 * a random salt so that short, guessable content cannot be brute-forced
 * from the public hash.
 */
export function computeCommitment(document: CommitmentDocument): Promise<Hex32> {
  return sha256Hex(utf8(canonicalJson(document)));
}

/**
 * The on-chain form of any entity id (`reportId`, `schoolId`): the UUID's
 * 16 bytes in the low half of a bytes32, zeros in the high half. Contracts,
 * backend and BonaBlock Verify all use this one mapping.
 */
export function idToBytes32(id: string): Hex32 {
  const hex = id.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`not a UUID: ${id}`);
  return `0x${"0".repeat(32)}${hex}`;
}
