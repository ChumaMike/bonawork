import { describe, expect, it } from "vitest";
import { digestEvidence, verifyEvidence } from "./index.js";

const bytes = new TextEncoder().encode("abc");
// Published SHA-256 test vector for "abc".
const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("verifier", () => {
  it("computes the standard SHA-256 digest", () => {
    expect(digestEvidence(bytes)).toBe(ABC);
  });

  it("matches untouched evidence, including 0x-prefixed upper-case digests", () => {
    expect(verifyEvidence(bytes, ABC).status).toBe("match");
    expect(verifyEvidence(bytes, `0x${ABC.toUpperCase()}`).status).toBe("match");
  });

  it("reports a mismatch when a single byte changes", () => {
    const tampered = new TextEncoder().encode("abd");
    expect(verifyEvidence(tampered, ABC)).toMatchObject({
      status: "mismatch",
      expected: ABC,
    });
  });

  it("rejects a malformed expected digest instead of reporting a mismatch", () => {
    expect(verifyEvidence(bytes, "not-a-digest").status).toBe("invalid-expected-digest");
  });
});
