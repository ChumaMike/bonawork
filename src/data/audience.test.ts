import { describe, expect, it } from "vitest";
import { can } from "@/shared";
import { isCommunityRole, workspaceFor } from "./audience";
import type { SessionRole } from "./types";

const STAFF: SessionRole[] = [
  "school_admin",
  "district_official",
  "independent_reviewer",
];

describe("who sees the community's actions", () => {
  it("shows them to people who are signed out and to community reporters", () => {
    expect(isCommunityRole(null)).toBe(true);
    expect(isCommunityRole("reporter")).toBe(true);
  });

  it("hides them from every staff role, matching what the backend allows", () => {
    for (const role of STAFF) {
      expect(isCommunityRole(role)).toBe(false);
      expect(can(role, "report:create")).toBe(false);
      expect(can(role, "report:endorse")).toBe(false);
    }
  });

  it("gives every staff role a workspace and the community none", () => {
    expect(workspaceFor(null)).toBeNull();
    expect(workspaceFor("reporter")).toBeNull();
    expect(workspaceFor("school_admin")?.href).toBe("/admin");
    expect(workspaceFor("independent_reviewer")?.href).toBe("/reviewer");
    expect(workspaceFor("district_official")?.href).toBe("/issues");
  });
});
