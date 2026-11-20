import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("keeps paths on this site, with their query and fragment", () => {
    expect(safeNext("/admin")).toBe("/admin");
    expect(safeNext("/issues?status=disputed#top")).toBe("/issues?status=disputed#top");
    // Dot segments that stay on this site are normalised, not rejected.
    expect(safeNext("/issues/../admin")).toBe("/admin");
  });

  it("rejects anything that could leave this site", () => {
    for (const value of [
      null,
      "",
      "admin",
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "\\\\evil.example",
      "/.//evil.example",
      "/..//evil.example",
      "/a/..//evil.example",
      "/././/evil.example",
      "/\tevil.example",
      "/\n/evil.example",
      "javascript:alert(1)",
    ]) {
      expect(safeNext(value), String(value)).toBeNull();
    }
  });
});
