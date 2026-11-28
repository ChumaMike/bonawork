import { describe, expect, it } from "vitest";
import { CAST, SUPPLIER_NAME } from "@/features/demo/cast";
import type { GuidedDemo } from "@/features/demo/client";
import type { PublicEscrow } from "@/features/escrow/api";
import { stepInfo } from "@/features/demo/steps";
import { EXAMPLE_REPAIRS } from "./fixtures";
import { clock, exampleLine, guidedLine, liveStatus, rand } from "./model";

const demo = (escrow: PublicEscrow | null): GuidedDemo => ({
  caseId: "case-1",
  reference: "BB-2026-000141",
  title: "Leaking toilets",
  description: "Two of four toilets leak.",
  location: "",
  schoolName: "Thandolwethu Primary School",
  status: "acknowledged",
  budget: null,
  escrow,
  escrowError: null,
  shared: false,
  template: {
    lines: [],
    amounts: [300_000, 200_000],
    claimNotes: ["", ""],
    reportNote: "",
    schoolDoneNote: "",
    challengeSeconds: 60,
  },
});

const tranche = (index: 0 | 1, state: string, challengeUntil = "0") => ({
  index,
  label: "",
  detail: "",
  payee: { address: "x", role: index === 0 ? "supplier" : "contractor", demo: true },
  amount: index === 0 ? "300000" : "200000",
  amountLabel: "",
  state,
  claimedAt: "0",
  verifiedAt: "0",
  challengeUntil,
  verificationDeadline: "0",
  settledAt: "0",
});

const escrow = (s0: string, s1: string, until = "0"): PublicEscrow =>
  ({
    funded: true,
    vault: { address: "v", url: "https://explorer", amount: "500000", label: null },
    escrow: { address: "e", url: "https://explorer/e" },
    tranches: [tranche(0, s0, until), tranche(1, s1)],
    transactions: [
      { step: "activate", signature: "a", at: "1764140000", url: "https://explorer/tx/a" },
      { step: "claim", index: 0, signature: "b", at: "1764140100", url: "https://explorer/tx/b" },
      { step: "verify", index: 0, signature: "c", at: "1764140200", url: "https://explorer/tx/c" },
    ],
  }) as unknown as PublicEscrow;

describe("the money line model", () => {
  it("formats rand and the countdown", () => {
    expect(rand(500_000)).toBe("R5 000");
    expect(clock(32)).toBe("0:32");
    expect(clock(75)).toBe("1:15");
  });

  it("names Emseni as the supplier and Themba as the contractor", () => {
    const line = guidedLine(demo(null), 0);
    expect(line.stations.map((s) => s.id)).toEqual(["in", "locked", "check1", "check2"]);
    expect(line.stations[2].label).toContain(SUPPLIER_NAME);
    expect(line.stations[3].label).toContain(CAST.contractor.name);
    expect(JSON.stringify(line)).not.toMatch(/Demo supplier/);
    expect(CAST.contractor.role).not.toMatch(/Emseni/);
  });

  it("lights the line up to Check 1 while the school may object", () => {
    const line = guidedLine(demo(escrow("Verified", "Pending", "1000")), 968);
    expect(line.stations.map((s) => s.state)).toEqual(["done", "done", "now", "next"]);
    expect(line.fill).toBeCloseTo(0.625);
    const events = line.stations[2].events.map((e) => e.text);
    expect(events).toContain("Waiting 0:32 for the school");
    expect(line.stations[2].events.some((e) => e.link?.href.includes("tx/c"))).toBe(true);
  });

  it("never says paid or resolved", () => {
    const all = [
      guidedLine(demo(escrow("Released", "Released")), 0),
      ...EXAMPLE_REPAIRS.map(exampleLine),
    ];
    expect(JSON.stringify(all)).not.toMatch(/\bpaid\b|\bresolved\b/i);
  });

  it("tells the school when the materials arrived", () => {
    expect(liveStatus(stepInfo("release1"), "school").text).toBe("Needs you: materials arrived");
    expect(liveStatus(stepInfo("fund"), "funder").tone).toBe("need");
    expect(liveStatus(stepInfo("fund"), "school").text).toBe("Waiting for a funder");
  });

  it("keeps example repairs off Solana", () => {
    for (const r of EXAMPLE_REPAIRS) {
      const line = exampleLine(r);
      expect(line.stations.every((s) => s.events.every((e) => !e.link))).toBe(true);
    }
  });
});
