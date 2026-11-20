// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFixtureApi } from "@/data/fixtures/fixture-api";
import { CASE_A_LINES } from "@/data/fixtures/procurement-seed";
import { CASE_A_ISSUE_ID as CASE_A, SAMPLE_PASSWORD } from "@/data/fixtures/seed";
import type { MoneyTrail, ReleaseProbe } from "@/data/types";
import { getMessages } from "@/i18n";
import { linesTotal } from "./money";
import { ReleaseGate } from "./release-gate";

const probeRelease = vi.fn<(issueId: string) => Promise<ReleaseProbe>>();
vi.mock("@/data/api", async (original) => ({
  ...(await original<typeof import("@/data/api")>()),
  getApi: () => ({ probeRelease }),
}));

const g = getMessages().procurement.gate;

/** Case A with a matched invoice: locked only by the missing independent review. */
async function matchedTrail(): Promise<MoneyTrail> {
  const api = createFixtureApi({ latency: 0, persist: false });
  await api.signIn("supplier@emseni-supplies.demo", SAMPLE_PASSWORD);
  return api.submitInvoice(CASE_A, {
    invoiceNumber: "INV-2042",
    orderVersion: 1,
    lines: CASE_A_LINES,
    totalCents: linesTotal(CASE_A_LINES),
    aiDrafted: false,
  });
}

afterEach(() => {
  cleanup();
  probeRelease.mockReset();
});

describe("asking the contract from the locked release gate", () => {
  it("shows the contract's own refusal and says nothing was written", async () => {
    probeRelease.mockResolvedValue({
      allowed: false,
      revert: "RepairNotVerified",
      source: "live",
    });
    const trail = await matchedTrail();
    render(<ReleaseGate trail={trail} status="repair_claimed" onAuthorise={vi.fn()} />);
    expect(screen.getByTestId("release-gate")).toHaveAttribute("data-gate", "locked");

    fireEvent.click(screen.getByRole("button", { name: g.probe.action }));
    const result = await screen.findByText(g.probe.refusedTitle);
    expect(result).toBeInTheDocument();
    expect(probeRelease).toHaveBeenCalledWith(trail.issueId);
    const box = screen.getByTestId("release-probe-result");
    expect(box).toHaveTextContent("RepairNotVerified");
    expect(box).toHaveTextContent(g.probe.reasons.RepairNotVerified);
    expect(box).toHaveTextContent(g.probe.live);
    // Asking is not authorising: the gate is still locked and offers no release.
    expect(screen.getByTestId("release-gate")).toHaveAttribute("data-gate", "locked");
    expect(screen.queryByRole("button", { name: g.authorise })).toBeNull();
  });

  it("labels an answer from sample data as not from Avalanche", async () => {
    probeRelease.mockResolvedValue({
      allowed: false,
      revert: "RepairNotVerified",
      source: "simulated",
    });
    render(
      <ReleaseGate
        trail={await matchedTrail()}
        status="repair_claimed"
        onAuthorise={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: g.probe.action }));
    await screen.findByText(g.probe.refusedTitle);
    expect(screen.getByTestId("release-probe-result")).toHaveTextContent(
      g.probe.simulated,
    );
    expect(screen.getByTestId("release-probe-result")).not.toHaveTextContent(
      g.probe.live,
    );
  });

  it("is not offered to someone who cannot authorise", async () => {
    render(<ReleaseGate trail={await matchedTrail()} status="repair_claimed" />);
    expect(screen.queryByRole("button", { name: g.probe.action })).toBeNull();
  });
});
