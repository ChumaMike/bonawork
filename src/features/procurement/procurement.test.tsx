// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Timeline } from "@/components/timeline";
import type { BonaApi } from "@/data/api";
import { createFixtureApi } from "@/data/fixtures/fixture-api";
import { CASE_A_LINES } from "@/data/fixtures/procurement-seed";
import {
  CASE_A_ISSUE_ID as CASE_A,
  CASE_B_ISSUE_ID as CASE_B,
  SAMPLE_PASSWORD,
} from "@/data/fixtures/seed";
import type {
  MoneyTrail,
  PublicTrailStep,
  SubmitInvoiceInput,
  TimelineEvent,
  TrailMatch,
} from "@/data/types";
import { getMessages } from "@/i18n";
import { sampleInvoiceText } from "./invoice-form";
import { MatchResult } from "./match-result";
import { linesTotal, parseRand } from "./money";
import { PublicTrail, StaffTrail } from "./money-trail";
import { ReleaseGate } from "./release-gate";
import { buildTrailRows, trailTime } from "./trail-rows";

const SUPPLIER = "supplier@emseni-supplies.demo";
const RECEIVER = "receiving@thandolwethu.demo";
const APPROVER = "approver@vaalridge.demo";
const REVIEWER = "reviewer@district.demo";

const m = getMessages();
const p = m.procurement;

/** Every amount on these screens is printed as rand. */
const AMOUNT = /R\s?\d/;
/** The people and the suppliers of the two sample cases. */
const NAMES = /Dlamini|Zulu|Ngcobo|van Wyk|Mahlangu|Emseni/;

const newApi = () => createFixtureApi({ latency: 0, persist: false });
async function as(api: BonaApi, email: string) {
  await api.signIn(email, SAMPLE_PASSWORD);
  return api;
}

const RIGHT: SubmitInvoiceInput = {
  invoiceNumber: "INV-2042",
  orderVersion: 1,
  lines: CASE_A_LINES,
  totalCents: linesTotal(CASE_A_LINES),
  aiDrafted: false,
};

beforeAll(() => {
  // jsdom has no modal dialogs; opening one only needs to make it open.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(cleanup);

describe("MatchResult", () => {
  const blocked: TrailMatch = {
    id: "match-1",
    outcome: "blocked",
    recordedAt: "2026-11-20T09:00:00.000Z",
    reasons: [
      { code: "quantity_mismatch", sku: "LOCK-3L", expected: 3, actual: 4 },
      { code: "unit_price_mismatch", sku: "LOCK-3L", expected: 68_500, actual: 73_500 },
    ],
  };

  it("shows what the rules found first, then the explanation under its own label", async () => {
    render(
      <MatchResult
        issueId="issue-1"
        match={blocked}
        onCorrect={() => {}}
        explain={async () => ({ source: "ai", text: "The locks cost more than agreed." })}
      />,
    );
    expect(
      screen.getByRole("heading", { name: p.match.blockedTitle }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${p.match.blockedCount(2)} ${p.match.nothingApproved}`),
    ).toBeInTheDocument();

    const reasons = within(screen.getByTestId("match-reasons")).getAllByRole("listitem");
    expect(reasons.map((item) => item.textContent)).toEqual([
      "LOCK-3L: 4 invoiced, 3 ordered.",
      "LOCK-3L: the unit price is R735,00. The order says R685,00.",
    ]);

    const explanation = await screen.findByText("The locks cost more than agreed.");
    const box = screen.getByTestId("match-explanation");
    expect(box).toHaveAttribute("data-source", "ai");
    expect(within(box).getByText(p.match.byAi)).toBeInTheDocument();
    expect(within(box).getByText(p.match.aiNote)).toBeInTheDocument();
    // Rules first: the list comes before the explanation in the page.
    expect(
      screen.getByTestId("match-reasons").compareDocumentPosition(explanation) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: p.match.correct })).toBeInTheDocument();
  });

  it("labels a code-written explanation as plain words, never as AI", async () => {
    render(
      <MatchResult
        issueId="issue-1"
        match={blocked}
        waitingForSupplier
        explain={async () => ({ source: "rules", text: "Plain sentence." })}
      />,
    );
    await screen.findByText("Plain sentence.");
    const box = screen.getByTestId("match-explanation");
    expect(box).toHaveAttribute("data-source", "rules");
    expect(within(box).getByText(p.match.plain)).toBeInTheDocument();
    expect(within(box).getByText(p.match.plainNote)).toBeInTheDocument();
    expect(box).not.toHaveTextContent(/Bona AI/);
    // Only the supplier can send a corrected invoice.
    expect(screen.queryByRole("button", { name: p.match.correct })).toBeNull();
    expect(screen.getByText(p.match.waitingForSupplier)).toBeInTheDocument();
  });

  it("keeps the result when the explanation cannot be loaded", async () => {
    render(
      <MatchResult
        issueId="issue-1"
        match={blocked}
        explain={() => Promise.reject(new Error("offline"))}
      />,
    );
    await vi.waitFor(() => expect(screen.queryByTestId("match-explanation")).toBeNull());
    expect(screen.getByTestId("match-reasons")).toBeInTheDocument();
  });

  it("states a price reason without an amount for a reader who has no prices", () => {
    render(
      <MatchResult
        issueId="issue-1"
        match={{
          ...blocked,
          reasons: [
            { code: "unit_price_mismatch", sku: "LOCK-3L", expected: null, actual: null },
            { code: "total_mismatch", sku: null, expected: null, actual: null },
          ],
        }}
        explain={() => new Promise(() => {})}
      />,
    );
    expect(screen.getByTestId("match-reasons")).not.toHaveTextContent(AMOUNT);
  });

  it("shows a matched invoice with no explanation box and the next step", () => {
    const explain = vi.fn();
    render(
      <MatchResult
        issueId="issue-1"
        match={{ ...blocked, outcome: "matched", reasons: [] }}
        explain={explain}
      />,
    );
    expect(
      screen.getByRole("heading", { name: p.match.matchedTitle }),
    ).toBeInTheDocument();
    expect(screen.getByText(p.match.matchedNext)).toBeInTheDocument();
    expect(screen.queryByTestId("match-explanation")).toBeNull();
    expect(explain).not.toHaveBeenCalled();
  });
});

describe("ReleaseGate", () => {
  /** Case A as the payment approver sees it at each point of the demo. */
  async function gateStates() {
    const api = newApi();
    const approver = async () => (await as(api, APPROVER)).getMoneyTrail(CASE_A);
    const start = (await approver())!;
    await as(api, SUPPLIER);
    await api.submitInvoice(CASE_A, { ...RIGHT, invoiceNumber: "INV-1", totalCents: 1 });
    const blocked = (await approver())!;
    await as(api, SUPPLIER);
    await api.submitInvoice(CASE_A, RIGHT);
    const matched = (await approver())!;
    await as(api, REVIEWER);
    await api.verifyCompletion(CASE_A, "Checked.");
    const open = (await approver())!;
    const released = await api.authoriseRelease(CASE_A);
    return { start, blocked, matched, open, released };
  }

  it("is locked, and says in plain words what must happen first", async () => {
    const { start, blocked, matched } = await gateStates();
    const onAuthorise = vi.fn();
    const view = render(
      <ReleaseGate trail={start} status="repair_claimed" onAuthorise={onAuthorise} />,
    );
    const gate = screen.getByTestId("release-gate");
    expect(gate).toHaveAttribute("data-gate", "locked");
    expect(screen.getByRole("heading", { name: p.gate.lockedTitle })).toBeInTheDocument();
    expect(screen.getByTestId("gate-summary")).toHaveTextContent(p.gate.lockedCount(2));
    const rows = within(screen.getByTestId("gate-checklist")).getAllByRole("listitem");
    expect(rows.map((row) => [row.dataset.kind, row.textContent])).toEqual([
      ["done", `${p.gate.state.done} ${p.gate.acknowledged.cleared}`],
      ["waiting", `${p.gate.state.waiting} ${p.gate.invoice.none}`],
      ["waiting", `${p.gate.state.waiting} ${p.gate.repair.claimed}`],
    ]);

    // Nothing here authorises anything: the only button is the locked one.
    expect(screen.queryByRole("button", { name: p.gate.authorise })).toBeNull();
    const locked = screen.getByRole("button", { name: p.gate.lockedButton });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(locked);
    expect(onAuthorise).not.toHaveBeenCalled();
    expect(screen.getByText(p.gate.lockedAnnounce(2))).toBeInTheDocument();
    expect(rows[1]).toHaveFocus();

    view.rerender(<ReleaseGate trail={blocked} status="repair_claimed" />);
    expect(
      within(screen.getByTestId("gate-checklist")).getByText(p.gate.invoice.blocked),
    ).toBeInTheDocument();

    view.rerender(<ReleaseGate trail={matched} status="repair_claimed" />);
    expect(screen.getByTestId("gate-summary")).toHaveTextContent(p.gate.lockedCount(1));
    expect(
      within(screen.getByTestId("gate-checklist")).getByText(p.gate.invoice.cleared),
    ).toBeInTheDocument();

    view.rerender(<ReleaseGate trail={matched} status="disputed" />);
    const repair = screen
      .getByTestId("gate-checklist")
      .querySelector("[data-check=repair]")!;
    expect(repair).toHaveAttribute("data-kind", "problem");
    expect(repair).toHaveTextContent(p.gate.repair.disputed);
    // The gate never shows an amount.
    expect(screen.getByTestId("release-gate")).not.toHaveTextContent(AMOUNT);
  });

  it("opens with one button, asks to confirm, and then shows the release", async () => {
    const { open, released } = await gateStates();
    const onAuthorise = vi.fn(async () => {});
    const view = render(
      <ReleaseGate
        trail={open}
        status="independently_verified"
        onAuthorise={onAuthorise}
      />,
    );
    expect(screen.getByTestId("release-gate")).toHaveAttribute("data-gate", "open");
    expect(screen.getByRole("heading", { name: p.gate.openTitle })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: p.gate.lockedButton })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: p.gate.authorise }));
    expect(onAuthorise).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", {
        name: p.gate.confirmTitle(open.reference),
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(p.gate.confirmBody)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("confirm-release"));
    await vi.waitFor(() => expect(onAuthorise).toHaveBeenCalledTimes(1));

    view.rerender(<ReleaseGate trail={released} status="independently_verified" byYou />);
    const gate = screen.getByTestId("release-gate");
    expect(gate).toHaveAttribute("data-gate", "authorised");
    expect(screen.getByRole("heading", { name: p.gate.doneTitle })).toBeInTheDocument();
    expect(screen.getByTestId("gate-summary")).toHaveTextContent(
      /^Authorised by you on /,
    );
    expect(screen.queryByRole("button", { name: p.gate.authorise })).toBeNull();
    expect(gate).not.toHaveTextContent(/\bpaid\b|payment made/i);
  });

  it("says so when the attempt was refused because the case changed", async () => {
    const { matched } = await gateStates();
    render(<ReleaseGate trail={matched} status="repair_claimed" conflict />);
    expect(screen.getByRole("alert")).toHaveTextContent(p.gate.conflict);
  });
});

describe("the trail", () => {
  async function caseB(email: string | null) {
    const api = newApi();
    if (email) await as(api, email);
    const issue = (await api.getIssue(CASE_B))!;
    const trail = email ? await api.getMoneyTrail(CASE_B) : null;
    return { issue, trail };
  }

  it("shows the public eight rows with roles, times and proof: no amount, no name, no document", async () => {
    const { issue } = await caseB(null);
    render(
      <PublicTrail
        issueId={issue.id}
        steps={issue.publicTrail!}
        timeline={issue.timeline}
        status={issue.status}
      />,
    );
    const trail = screen.getByTestId("public-trail");
    expect(
      screen.getByRole("heading", { name: p.trail.publicTitle }),
    ).toBeInTheDocument();
    const rows = within(trail).getAllByTestId("trail-row");
    expect(rows.map((row) => [row.dataset.row, row.dataset.state])).toEqual([
      ["reported", "done"],
      ["order", "done"],
      ["acknowledged", "done"],
      ["invoice", "done"],
      ["delivery", "done"],
      ["match", "done"],
      ["verified", "done"],
      ["release", "done"],
    ]);
    expect(within(rows[1]).getByRole("heading")).toHaveTextContent(
      `${p.trail.state.done} ${p.trail.title.order}`,
    );
    expect(rows[1]).toHaveTextContent(m.actor.buyer);
    expect(rows[5]).toHaveTextContent(p.rules);
    expect(rows[5]).toHaveTextContent(p.trail.matchDone);
    expect(rows[5]).toHaveTextContent(p.trail.earlierBlocked(1));
    expect(rows[7]).toHaveTextContent(p.trail.releaseDone);
    for (const row of rows) {
      expect(row.querySelector("time")).not.toBeNull();
      expect(row.querySelector("[data-ledger]")).not.toBeNull();
    }

    expect(trail).not.toHaveTextContent(AMOUNT);
    expect(trail).not.toHaveTextContent(NAMES);
    expect(trail).not.toHaveTextContent(/INV-|SUP-|FENCE-POST/);
    expect(within(trail).queryByTestId("trail-person")).toBeNull();
    expect(within(trail).queryByText(p.order.see)).toBeNull();

    // The proof of a procurement step is its receipt. The document is not offered.
    fireEvent.click(within(rows[1]).getByTestId("show-proof"));
    const sheet = screen.getByTestId("proof-sheet");
    expect(
      within(sheet).getByRole("button", { name: /Copy receipt/, hidden: true }),
    ).toBeInTheDocument();
    expect(
      within(sheet).queryByRole("button", { name: /Copy document/, hidden: true }),
    ).toBeNull();
    expect(sheet).not.toHaveTextContent(NAMES);
    expect(trail).not.toHaveTextContent(/\bpaid\b|resolved/i);
  });

  it("marks the next step for a case with no work order, and waits by name of the role", async () => {
    const issue = (await newApi().getIssue("issue-118"))!;
    render(
      <PublicTrail
        issueId={issue.id}
        steps={issue.publicTrail ?? []}
        timeline={issue.timeline}
        status={issue.status}
      />,
    );
    const rows = screen.getAllByTestId("trail-row");
    expect(rows.map((row) => row.dataset.state)).toEqual([
      "done",
      ...Array.from({ length: 7 }, () => "waiting"),
    ]);
    expect(rows[1]).toHaveAttribute("aria-current", "step");
    expect(rows[1]).toHaveTextContent(p.trail.next);
    expect(rows[1]).toHaveTextContent(p.trail.waiting.order);
    expect(rows[2]).not.toHaveAttribute("aria-current");
    expect(rows[2].querySelector("time")).toBeNull();
  });

  it("shows a blocked invoice on the public trail from the step outcome, never from its words", async () => {
    const api = await as(newApi(), SUPPLIER);
    await api.submitInvoice(CASE_A, { ...RIGHT, totalCents: 1 });
    await api.signOut();
    const issue = (await api.getIssue(CASE_A))!;
    // The same sentence is on every rule-engine step: only `outcome` differs.
    const matches = issue.publicTrail!.filter((step) => step.type === "match_recorded");
    expect(matches.map((step) => step.outcome)).toEqual(["blocked"]);
    render(
      <PublicTrail
        issueId={issue.id}
        steps={issue.publicTrail!}
        timeline={issue.timeline}
        status={issue.status}
      />,
    );
    const row = screen
      .getAllByTestId("trail-row")
      .find((candidate) => candidate.dataset.row === "match")!;
    expect(row).toHaveAttribute("data-state", "blocked");
    expect(row).toHaveTextContent(`${p.trail.state.blocked} ${p.trail.title.match}`);
    expect(row).toHaveTextContent(p.trail.matchBlocked);
    // While a row is blocked, no later row is "Next".
    expect(document.querySelector("[aria-current=step]")).toBeNull();
    expect(screen.getByTestId("public-trail")).not.toHaveTextContent(AMOUNT);
  });

  it("gives staff with prices the named person and the money on each step", async () => {
    const { issue, trail } = await caseB(APPROVER);
    render(<StaffTrail trail={trail!} timeline={issue.timeline} status={issue.status} />);
    const view = screen.getByTestId("staff-trail");
    expect(view).toHaveAttribute("data-prices", "visible");
    expect(screen.getByRole("heading", { name: p.trail.staffTitle })).toBeInTheDocument();
    const row = (key: string) =>
      screen.getAllByTestId("trail-row").find((item) => item.dataset.row === key)!;
    expect(within(row("order")).getByTestId("trail-person")).toHaveTextContent(
      "Ms Naledi Dlamini",
    );
    expect(row("order")).toHaveTextContent("3 lines · R20 550,00");
    expect(within(row("order")).getByTestId("order-total")).toHaveTextContent(
      "R20 550,00",
    );
    expect(row("acknowledged")).toHaveTextContent("Ms Zodwa Mahlangu");
    expect(row("invoice")).toHaveTextContent("Invoice INV-1991 · R20 550,00");
    expect(row("invoice")).toHaveTextContent(p.trail.aiDrafted);
    expect(row("delivery")).toHaveTextContent("Mrs Ayanda Ngcobo");
    expect(row("delivery")).toHaveTextContent("22 of 22 items arrived");
    // The rules are nobody: a role label and no name.
    expect(within(row("match")).queryByTestId("trail-person")).toBeNull();
    expect(row("match")).toHaveTextContent(p.rules);
    expect(row("release")).toHaveTextContent("Mr Pieter van Wyk");

    // A procurement document is offered here, to people who may read the trail.
    fireEvent.click(within(row("order")).getByTestId("show-proof"));
    expect(
      within(screen.getByTestId("proof-sheet")).getByRole("button", {
        name: /Copy document/,
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  it("gives the school, the reviewer and the receiving officer names and quantities, never a price", async () => {
    for (const email of [RECEIVER, REVIEWER, "admin@thuto-lesedi.demo"]) {
      const { issue, trail } = await caseB(email);
      render(
        <StaffTrail trail={trail!} timeline={issue.timeline} status={issue.status} />,
      );
      const view = screen.getByTestId("staff-trail");
      expect(view).toHaveAttribute("data-prices", "hidden");
      expect(view).toHaveTextContent("Ms Naledi Dlamini");
      expect(view).toHaveTextContent("3 lines · 22 items");
      expect(view).toHaveTextContent("Invoice INV-1991");
      expect(view).not.toHaveTextContent(AMOUNT);
      expect(within(view).queryByTestId("order-total")).toBeNull();
      expect(within(view).queryByText(p.order.unitPrice)).toBeNull();

      // Without prices, only the documents that hold none are offered.
      const rowOf = (key: string) =>
        screen.getAllByTestId("trail-row").find((item) => item.dataset.row === key)!;
      const documentFor = (key: string) => {
        fireEvent.click(within(rowOf(key)).getByTestId("show-proof"));
        const sheets = screen.getAllByTestId("proof-sheet");
        return within(sheets[sheets.length - 1]).queryByRole("button", {
          name: /Copy document/,
          hidden: true,
        });
      };
      expect(documentFor("order")).toBeNull();
      expect(documentFor("delivery")).not.toBeNull();
      cleanup();
    }
  });

  it("keeps the eight rows in one order even when the delivery came before the invoice", async () => {
    const api = newApi();
    const issue = (await api.getIssue(CASE_A))!;
    const rows = buildTrailRows({
      steps: issue.publicTrail!,
      timeline: issue.timeline,
      status: issue.status,
    });
    expect(
      rows.map((row) => `${row.key}:${row.state}${row.next ? ":next" : ""}`),
    ).toEqual([
      "reported:done",
      "order:done",
      "acknowledged:done",
      "invoice:waiting:next",
      "delivery:done",
      "match:waiting",
      "verified:waiting",
      "release:waiting",
    ]);

    // A new order version waits for the supplier again.
    const step = (
      type: PublicTrailStep["type"],
      actor: PublicTrailStep["actor"],
      occurredAt: string,
    ): PublicTrailStep => ({
      eventId: `${type}-${occurredAt}`,
      type,
      actor,
      occurredAt,
      note: "",
      ledger: { source: "none" },
    });
    expect(
      buildTrailRows({
        steps: [
          step("work_order_approved", "buyer", "2026-11-01T08:00:00.000Z"),
          step("work_order_acknowledged", "supplier", "2026-11-02T08:00:00.000Z"),
          step("work_order_approved", "buyer", "2026-11-03T08:00:00.000Z"),
        ],
        timeline: issue.timeline,
        status: issue.status,
      }).find((row) => row.key === "acknowledged"),
    ).toMatchObject({ state: "waiting", next: true });
  });

  it("writes a time as relative within a day and as a date after it", () => {
    const now = Date.parse("2026-11-20T12:00:00.000Z");
    expect(trailTime("2026-11-20T11:59:40.000Z", m, now)).toBe("just now");
    expect(trailTime("2026-11-20T11:15:00.000Z", m, now)).toBe("45 minutes ago");
    expect(trailTime("2026-11-20T10:00:00.000Z", m, now)).toBe("2 hours ago");
    expect(trailTime("2026-11-18T07:14:00.000Z", m, now)).toMatch(/^18 Nov,? \d\d:14$/);
  });
});

describe("the public timeline", () => {
  it("has no procurement entries in the sample data, as on the backend", async () => {
    const issue = (await newApi().getIssue(CASE_B))!;
    render(<Timeline issueId={issue.id} events={issue.timeline} />);
    expect(screen.queryAllByTestId("timeline-finance")).toHaveLength(0);
  });

  it("would show a procurement entry as its name, role, time and proof only", () => {
    // Defence in depth: should such an entry ever arrive, nothing private can show.
    const entry = (
      id: string,
      type: TimelineEvent["type"],
      actor: TimelineEvent["actor"],
    ): TimelineEvent => ({
      id,
      type,
      actor,
      note: "Ms Naledi Dlamini approved R4 200,00 for Emseni.",
      occurredAt: "2026-11-18T08:00:00.000Z",
      ledger: { source: "simulated", status: "confirmed" },
    });
    render(
      <Timeline
        issueId="issue-1"
        events={[
          entry("e1", "work_order_approved", "buyer"),
          entry("e2", "match_recorded", "system"),
        ]}
      />,
    );
    const steps = screen.getAllByTestId("timeline-finance");
    expect(steps).toHaveLength(2);
    for (const step of steps) {
      expect(step.querySelector("time")).not.toBeNull();
      expect(step.querySelector("[data-ledger]")).not.toBeNull();
      expect(step).not.toHaveTextContent(AMOUNT);
      expect(step).not.toHaveTextContent(NAMES);
    }
    expect(steps.some((step) => step.textContent!.includes(p.rules))).toBe(true);
    fireEvent.click(within(steps[0]).getByTestId("show-proof"));
    expect(
      within(screen.getByTestId("proof-sheet")).queryByRole("button", {
        name: /Copy document/,
        hidden: true,
      }),
    ).toBeNull();
  });
});

describe("the sample invoice", () => {
  it("is text the draft reader turns back into the order, and one with a mistake", async () => {
    const api = await as(newApi(), SUPPLIER);
    const trail = (await api.getMoneyTrail(CASE_A)) as MoneyTrail;
    const right = await api.draftInvoice(CASE_A, sampleInvoiceText(trail.order, false));
    expect(right.missing).toEqual([]);
    expect(right.lines).toEqual(CASE_A_LINES);
    expect(right.totalCents).toBe(trail.order.totalCents);

    const wrong = await api.draftInvoice(CASE_A, sampleInvoiceText(trail.order, true));
    expect(wrong.missing).toEqual([]);
    expect(wrong.invoiceNumber).not.toBe(right.invoiceNumber);
    expect(wrong.lines[0]).toMatchObject({ quantity: 4, unitPriceCents: 70_000 });
    expect(wrong.totalCents).not.toBe(trail.order.totalCents);
  });

  it("reads rand however it is written, and refuses what is not an amount", () => {
    expect(parseRand("R5 885,00")).toBe(588_500);
    expect(parseRand("R 5 885.00")).toBe(588_500);
    expect(parseRand("1,250.50")).toBe(125_050);
    expect(parseRand("685")).toBe(68_500);
    expect(parseRand("685.5")).toBe(68_550);
    expect(parseRand("lots")).toBeNull();
    expect(parseRand("12.345")).toBeNull();
    expect(parseRand("")).toBeNull();
  });
});
