// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LedgerPanel } from "@/components/ledger-state";
import { StatusProgress } from "@/components/status";
import type { BlockchainReceipt } from "@/shared";
import Home from "./page";

afterEach(cleanup);

describe("home page", () => {
  it("asks one question, which school, and keeps the tagline", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Which school is it about?",
    );
    expect(screen.getByText("See it. Report it. Prove it.")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Which school is it about?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Find school" })).toBeInTheDocument();
  });

  it("offers report, track, all problems and the schools list, and no staff workspace", () => {
    render(<Home />);
    const expected: [string, string][] = [
      ["Report a problem", "/report"],
      ["Check on my report", "/track"],
      ["See all problems", "/issues"],
      ["See all schools", "/schools"],
    ];
    for (const [name, href] of expected) {
      expect(screen.getByRole("link", { name: new RegExp(name) })).toHaveAttribute(
        "href",
        href,
      );
    }
    // Nothing else to tap: staff workspaces stay behind sign-in and the footer.
    expect(screen.getAllByRole("link")).toHaveLength(expected.length);
  });

  it("says what Bona Chain does in three steps: report, check, prove", () => {
    render(<Home />);
    const how = screen.getByRole("heading", { level: 2, name: "What Bona Chain does" });
    const steps = within(how.closest("section")!).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      expect.stringMatching(/^1Report/),
      expect.stringMatching(/^2Check/),
      expect.stringMatching(/^3Prove/),
    ]);
  });

  it("explains the trail in plain words, with the role that takes each step", () => {
    render(<Home />);
    const rows = within(screen.getByTestId("trail-explainer")).getAllByRole("listitem");
    const read = rows.map((row) => [
      within(row).getByRole("heading", { level: 3 }).textContent,
      // The role label is the badge under the heading.
      row.querySelector("h3 + span")?.textContent,
    ]);
    expect(read).toEqual([
      ["Problem reported", "Community member"],
      ["Work order approved", "Funder"],
      ["Supplier acknowledged the order", "Supplier"],
      ["Invoice submitted", "Supplier"],
      ["Delivery recorded", "Receiving officer"],
      ["Invoice checked against order and delivery", "Bona Chain rules"],
      ["Repair independently verified", "Independent reviewer"],
      ["Release authorised", "Payment approver"],
    ]);
    expect(
      screen.getByText(/the last step records an instruction, not a payment/),
    ).toBeInTheDocument();
  });

  it("shows no amount, and never says paid or resolved", () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bR\s?\d/);
    expect(text).not.toMatch(/\bpaid\b|\bresolved\b|BonaBlock/i);
    // No finished case in the practice data: the showcase section is absent, not empty.
    expect(screen.queryByTestId("public-trail-showcase")).not.toBeInTheDocument();
  });
});

describe("status and ledger honesty", () => {
  it("says a repair claim is not verified yet", () => {
    render(<StatusProgress status="repair_claimed" />);
    expect(screen.getByText("Repair claimed")).toBeInTheDocument();
    expect(screen.getByText("Not verified yet")).toBeInTheDocument();
    expect(screen.queryByText("Independently verified")).not.toBeInTheDocument();
  });

  it("labels sample ledger records as not real and shows no transaction", () => {
    render(<LedgerPanel record={{ source: "simulated", status: "confirmed" }} />);
    expect(screen.getByText(/not a real Avalanche transaction/)).toBeInTheDocument();
    expect(screen.queryByText("Transaction")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // Only the fields the panel reads. The receipt type gains and loses other
  // fields as the shared contract evolves; the panel does not depend on them.
  const receiptOn = (chainId: string) =>
    ({
      chainId,
      contractAddress: `0x${"c".repeat(40)}`,
      txId: `0x${"d".repeat(64)}`,
      status: "confirmed",
      blockNumber: 12,
      blockTimestamp: "2026-11-16T09:30:00.000Z",
    }) as unknown as BlockchainReceipt;

  it("shows transaction details and an explorer link only for a real receipt", () => {
    render(
      <LedgerPanel record={{ source: "ledger", receipt: receiptOn("eip155:43113") }} />,
    );
    expect(screen.getByText("Recorded on Avalanche")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `https://testnet.snowtrace.io/tx/0x${"d".repeat(64)}`,
    );
  });

  it("treats a receipt from the in-memory development ledger as a sample", () => {
    render(
      <LedgerPanel record={{ source: "ledger", receipt: receiptOn("bona:memory") }} />,
    );
    expect(screen.getByText(/not a real Avalanche transaction/)).toBeInTheDocument();
    expect(screen.queryByText("Recorded on Avalanche")).not.toBeInTheDocument();
    expect(screen.queryByText("Transaction")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a declined report as declined, not as progress", () => {
    render(<StatusProgress status="declined" />);
    expect(screen.getByText("Declined by school")).toBeInTheDocument();
  });
});
