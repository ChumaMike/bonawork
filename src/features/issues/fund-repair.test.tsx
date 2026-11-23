// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Audience } from "@/data/audience";
import type { Issue, IssueStatus, PublicTrailStep } from "@/data/types";
import { getMessages } from "@/i18n";
import { FundRepair, fundRepairHref, needsFunder } from "./fund-repair";

const words = getMessages().issue.fund;

const signedOut: Audience = { status: "ready", role: null, community: true };
const reporter: Audience = { status: "ready", role: "reporter", community: true };
const funder: Audience = { status: "ready", role: "buyer", community: false };
const supplier: Audience = { status: "ready", role: "supplier", community: false };
const loading: Audience = { status: "loading", role: null, community: true };

/** Only the field the rule reads. A real step carries its time, role and proof too. */
const step = (type: PublicTrailStep["type"]) => ({ type }) as PublicTrailStep;

const issue = (
  status: IssueStatus,
  publicTrail?: PublicTrailStep[],
): Pick<Issue, "id" | "status" | "publicTrail"> => ({
  id: "issue-118",
  status,
  publicTrail,
});

afterEach(cleanup);

describe("whether a case still needs a funder", () => {
  it("does while the problem is open and no work order is approved", () => {
    for (const status of ["reported", "under_assessment", "being_addressed"] as const) {
      expect(needsFunder(issue(status))).toBe(true);
      expect(needsFunder(issue(status, []))).toBe(true);
    }
  });

  it("does not once a work order is approved", () => {
    expect(needsFunder(issue("being_addressed", [step("work_order_approved")]))).toBe(
      false,
    );
  });

  it("does not once a repair is claimed, checked or declined", () => {
    for (const status of [
      "repair_claimed",
      "independently_verified",
      "disputed",
      "declined",
    ] as const) {
      expect(needsFunder(issue(status))).toBe(false);
    }
  });
});

describe("where “Fund this repair” leads", () => {
  it("sends a visitor to sign in, and on to the case afterwards", () => {
    const href = "/sign-in?next=%2Fbuyer%3Fcase%3Dissue-118";
    expect(fundRepairHref("issue-118", signedOut)).toBe(href);
    expect(fundRepairHref("issue-118", reporter)).toBe(href);
  });

  it("sends a signed-in funder straight to the case in their workspace", () => {
    expect(fundRepairHref("issue-118", funder)).toBe("/buyer?case=issue-118");
  });
});

describe("the “Fund this repair” card on the public issue page", () => {
  it("is offered to a visitor on a case with no work order", () => {
    render(<FundRepair issue={issue("under_assessment")} audience={signedOut} />);
    const card = screen.getByTestId("fund-repair");
    expect(card).toHaveTextContent(words.title);
    expect(screen.getByRole("link", { name: "Fund this repair" })).toHaveAttribute(
      "href",
      "/sign-in?next=%2Fbuyer%3Fcase%3Dissue-118",
    );
    // A release is an instruction, never money that moved.
    expect(card).toHaveTextContent("No real money moves.");
    expect(card.textContent).not.toMatch(/\bpaid\b|\bresolved\b|\bbuyer\b/i);
  });

  it("takes a funder to the case", () => {
    render(<FundRepair issue={issue("under_assessment")} audience={funder} />);
    expect(screen.getByRole("link", { name: "Fund this repair" })).toHaveAttribute(
      "href",
      "/buyer?case=issue-118",
    );
  });

  it("is not shown once the case has a work order", () => {
    render(
      <FundRepair
        issue={issue("being_addressed", [step("work_order_approved")])}
        audience={signedOut}
      />,
    );
    expect(screen.queryByTestId("fund-repair")).not.toBeInTheDocument();
  });

  it("is not shown to staff who have no part in funding, or before we know who is here", () => {
    render(<FundRepair issue={issue("under_assessment")} audience={supplier} />);
    expect(screen.queryByTestId("fund-repair")).not.toBeInTheDocument();
    cleanup();
    render(<FundRepair issue={issue("under_assessment")} audience={loading} />);
    expect(screen.queryByTestId("fund-repair")).not.toBeInTheDocument();
  });
});
