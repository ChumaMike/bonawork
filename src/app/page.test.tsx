// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LedgerPanel } from "@/components/ledger-state";
import { StatusProgress } from "@/components/status";
import type { BlockchainReceipt } from "@/shared";
import Home from "./page";

afterEach(cleanup);

describe("home page", () => {
  it("has one h1, the promise, and says it runs on a test network", () => {
    render(<Home />);
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(
      "From the report to the release, every step checked.",
    );
    expect(
      screen.getByText("Live on the Solana devnet test network"),
    ).toBeInTheDocument();
  });

  it("keeps the school search, sent to the schools page", () => {
    render(<Home />);
    const box = screen.getByRole("searchbox", { name: "Which school is it about?" });
    expect(box).toHaveAttribute("name", "q");
    expect(box.closest("form")).toHaveAttribute("action", "/schools");
    expect(screen.getByRole("button", { name: "Find school" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("offers report, track, all problems and the schools list as tiles", () => {
    render(<Home />);
    const tiles = within(screen.getByTestId("home-tiles")).getAllByRole("link");
    expect(tiles.map((tile) => tile.getAttribute("href"))).toEqual([
      "/report",
      "/track",
      "/issues",
    ]);
    expect(screen.getByRole("link", { name: /See all schools/ })).toHaveAttribute(
      "href",
      "/schools",
    );
  });

  it("links only to public pages that exist, and to no staff workspace", () => {
    render(<Home />);
    const hrefs = () =>
      [
        ...new Set(screen.getAllByRole("link").map((link) => link.getAttribute("href"))),
      ].sort();
    expect(hrefs()).toEqual(["/issues", "/report", "/schools", "/track"]);
    // The staff tabs lead to sign-in: workspaces stay behind it and in the footer.
    for (const name of ["Supplier", "Independent reviewer", "Payment approver"]) {
      fireEvent.click(screen.getByRole("tab", { name }));
      expect(hrefs()).toEqual(["/issues", "/report", "/schools", "/sign-in", "/track"]);
    }
  });

  it("keeps the headings in order, with no level skipped", () => {
    render(<Home />);
    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));
    expect(levels[0]).toBe(1);
    levels.reduce((before, level) => {
      expect(level - before).toBeLessThanOrEqual(1);
      return level;
    });
    for (const title of [
      "Fewer promises. More proof.",
      "Everything behind every repair",
      "Every step. Every person. One trail.",
      "Free for schools. Funded by who needs proof.",
      "Frequently asked questions",
      "Report it. Check it. Prove it.",
    ]) {
      expect(screen.getByRole("heading", { level: 2, name: title })).toBeInTheDocument();
    }
  });

  it("shows the four people as tabs that the arrow keys move between", () => {
    render(<Home />);
    const tabs = within(
      screen.getByRole("tablist", { name: "Who does what" }),
    ).getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Community",
      "Supplier",
      "Independent reviewer",
      "Payment approver",
    ]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Community" })).toHaveTextContent(
      "Report a problem and follow it.",
    );

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
    expect(tabs[0]).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel", { name: "Supplier" })).toHaveTextContent(
      "Bona AI explains the reasons and decides nothing",
    );

    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(tabs[3]).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Payment approver" })).toHaveTextContent(
      "A release is an instruction. No money moves",
    );

    fireEvent.keyDown(tabs[3], { key: "ArrowRight" });
    expect(tabs[0]).toHaveFocus();

    fireEvent.click(tabs[2]);
    expect(
      screen.getByRole("tabpanel", { name: "Independent reviewer" }),
    ).toHaveTextContent("Only a reviewer can mark a repair as verified");
  });

  it("opens and closes each question, with the first one open", () => {
    render(<Home />);
    const faq = within(screen.getByTestId("landing-faq"));
    const questions = faq.getAllByRole("button");
    expect(questions).toHaveLength(6);
    expect(questions.map((question) => question.getAttribute("aria-expanded"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "false",
      "false",
    ]);
    expect(faq.getAllByRole("region")).toHaveLength(1);

    const money = faq.getByRole("button", { name: "Does any money move?" });
    fireEvent.click(money);
    expect(money).toHaveAttribute("aria-expanded", "true");
    expect(faq.getByRole("region", { name: "Does any money move?" })).toHaveTextContent(
      "It is an instruction, not a payment.",
    );

    fireEvent.click(questions[0]);
    expect(questions[0]).toHaveAttribute("aria-expanded", "false");
    expect(faq.getAllByRole("region")).toHaveLength(1);
  });

  it("is honest: a test network, no real school yet, no prices, an AI that decides nothing", () => {
    const { container } = render(<Home />);
    const text = container.textContent ?? "";
    expect(text).toContain("no real school uses it today");
    expect(text).toContain("no prices are set yet");
    expect(text).toContain("It never approves, verifies or authorises anything.");
    expect(text).toContain(
      "The principal of Thaba Jabula Secondary School told us they would use it.",
    );
    // The drawings are marked as drawings.
    expect(
      screen.getByRole("img", {
        name: "A sample case, drawn to show what the trail holds",
      }),
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
    expect(screen.getByText(/not a real Solana transaction/)).toBeInTheDocument();
    expect(screen.queryByText("Transaction")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  const SIGNATURE =
    "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";

  // Only the fields the panel reads. The receipt type gains and loses other
  // fields as the shared contract evolves; the panel does not depend on them.
  const receiptOn = (chainId: string) =>
    ({
      chainId,
      contractAddress: "5LkegW1dBfTL1Xiw2n15Rt99ZVcG4uipCjDH9bMiyEGY",
      txId: SIGNATURE,
      status: "confirmed",
      blockNumber: 12,
      blockTimestamp: "2026-11-16T09:30:00.000Z",
    }) as unknown as BlockchainReceipt;

  it("shows transaction details and an explorer link only for a real receipt", () => {
    render(
      <LedgerPanel record={{ source: "ledger", receipt: receiptOn("solana:devnet") }} />,
    );
    expect(screen.getByText("Recorded on Solana")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `https://explorer.solana.com/tx/${SIGNATURE}?cluster=devnet`,
    );
  });

  it("treats a receipt from the in-memory development ledger as a sample", () => {
    render(
      <LedgerPanel record={{ source: "ledger", receipt: receiptOn("bona:memory") }} />,
    );
    expect(screen.getByText(/not a real Solana transaction/)).toBeInTheDocument();
    expect(screen.queryByText("Recorded on Solana")).not.toBeInTheDocument();
    expect(screen.queryByText("Transaction")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a declined report as declined, not as progress", () => {
    render(<StatusProgress status="declined" />);
    expect(screen.getByText("Declined by school")).toBeInTheDocument();
  });
});
