// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Issue, IssueSummary, PublicTrailStep, TimelineEvent } from "@/data/types";
import { PublicTrailShowcase, findFinishedCase } from "./public-trail-showcase";

afterEach(cleanup);

/** Canary text. If a step's note were ever drawn, these would show. */
const CANARY = "R780.00 owed to Mokoena Plumbing, approved by Nomvula Khumalo";

const step = (
  n: number,
  type: PublicTrailStep["type"],
  actor: PublicTrailStep["actor"],
  extra: Partial<PublicTrailStep> = {},
): PublicTrailStep => ({
  eventId: `00000000-0000-4000-8000-00000000000${n}`,
  type,
  actor,
  occurredAt: `2026-11-1${n}T08:00:00.000Z`,
  note: CANARY,
  ledger: { source: "simulated", status: "confirmed" },
  ...extra,
});

/** Case B: a blocked first invoice, then a corrected one, then the release. */
const TRAIL: PublicTrailStep[] = [
  step(1, "work_order_approved", "buyer"),
  step(2, "work_order_acknowledged", "supplier"),
  step(3, "goods_receipt_recorded", "receiving_officer"),
  step(4, "invoice_submitted", "supplier"),
  step(5, "match_recorded", "system", { outcome: "blocked" }),
  step(6, "invoice_submitted", "supplier"),
  step(7, "match_recorded", "system", { outcome: "matched" }),
  step(9, "release_authorised", "payment_approver"),
];

const event = (
  id: string,
  type: TimelineEvent["type"],
  actor: TimelineEvent["actor"],
  occurredAt: string,
): TimelineEvent => ({
  id,
  type,
  actor,
  occurredAt,
  note: CANARY,
  ledger: { source: "none" },
});

const CASE = {
  id: "issue-b",
  reference: "BB-2026-000044",
  schoolName: "Thandolwethu Primary",
};

describe("PublicTrailShowcase", () => {
  it("renders nothing without steps", () => {
    for (const steps of [undefined, null, []]) {
      const { container } = render(<PublicTrailShowcase steps={steps} issue={CASE} />);
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });

  it("shows each step with its role, its date and its proof", () => {
    render(<PublicTrailShowcase steps={TRAIL} issue={CASE} />);
    const rows = within(screen.getByTestId("public-trail-showcase")).getAllByRole(
      "listitem",
    );
    expect(
      rows.map((row) => [
        within(row).getByRole("heading", { level: 3 }).textContent,
        row.querySelector("p > span")?.textContent,
      ]),
    ).toEqual([
      ["Work order approved", "Funder"],
      ["Supplier acknowledged the order", "Supplier"],
      ["Delivery recorded", "Receiving officer"],
      ["Invoice submitted", "Supplier"],
      ["Invoice checked against order and delivery", "Bona Chain rules"],
      ["Invoice submitted", "Supplier"],
      ["Invoice checked against order and delivery", "Bona Chain rules"],
      ["Release authorised", "Payment approver"],
    ]);
    for (const row of rows) {
      expect(row.querySelector("time")).toHaveAttribute("datetime");
      // A simulated record is labelled as a sample, never as an Avalanche record.
      expect(row.querySelector("[data-ledger]")).toHaveAttribute(
        "data-ledger",
        "simulated",
      );
    }
    expect(rows[4]).toHaveTextContent("The invoice did not match");
    expect(rows[6]).toHaveTextContent("The invoice matches the order and the delivery.");
    expect(rows[7]).toHaveTextContent("An instruction, not a payment.");
  });

  it("names the case and links only to its public page", () => {
    render(<PublicTrailShowcase steps={TRAIL} issue={CASE} />);
    expect(
      screen.getByText("BB-2026-000044 at Thandolwethu Primary"),
    ).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/issues/issue-b");
  });

  it("never draws a step's note: no amount, supplier or person can appear", () => {
    const { container } = render(
      <PublicTrailShowcase
        steps={TRAIL}
        issue={CASE}
        around={[event("e-0", "reported", "community", "2026-11-10T08:00:00.000Z")]}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/Mokoena|Nomvula|780|R\s?\d/);
    expect(text).not.toMatch(/\bpaid\b|\bresolved\b/i);
  });

  it("puts the report and the verification in time order among the steps", () => {
    render(
      <PublicTrailShowcase
        steps={TRAIL}
        issue={CASE}
        around={[
          event("e-8", "verified", "reviewer", "2026-11-18T08:00:00.000Z"),
          event("e-0", "reported", "community", "2026-11-10T08:00:00.000Z"),
        ]}
      />,
    );
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(titles[0]).toBe("Problem reported");
    expect(titles.slice(-2)).toEqual([
      "Repair independently verified",
      "Release authorised",
    ]);
    expect(screen.getByText("Independent reviewer")).toBeInTheDocument();
  });
});

describe("findFinishedCase", () => {
  const summary = (id: string) => ({ id }) as IssueSummary;
  const issue = (id: string, publicTrail?: PublicTrailStep[]) =>
    ({ id, publicTrail }) as Issue;

  it("picks the first verified case whose trail ends in an authorised release", async () => {
    const listIssues = vi.fn(async () => [summary("a"), summary("b"), summary("c")]);
    const cases: Record<string, Issue> = {
      a: issue("a"),
      b: issue("b", TRAIL.slice(0, 5)),
      c: issue("c", TRAIL),
    };
    const found = await findFinishedCase({
      listIssues,
      getIssue: async (id) => cases[id] ?? null,
    });
    expect(found?.id).toBe("c");
    expect(listIssues).toHaveBeenCalledWith({
      status: "independently_verified",
      sort: "recent",
    });
  });

  it("is null when no case has a finished trail, and looks at six cases at most", async () => {
    const getIssue = vi.fn(async (id: string) => issue(id, TRAIL.slice(0, 3)));
    const found = await findFinishedCase({
      listIssues: async () => Array.from({ length: 20 }, (_, n) => summary(`case-${n}`)),
      getIssue,
    });
    expect(found).toBeNull();
    expect(getIssue).toHaveBeenCalledTimes(6);
  });
});
