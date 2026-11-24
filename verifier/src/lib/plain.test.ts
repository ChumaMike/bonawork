import { describe, expect, it } from "vitest";
import {
  formatRecordedAt,
  networkName,
  nounFor,
  OUTCOME_GUIDE,
  plainAnswer,
  RECORD_NAME,
  SAMPLE_ANSWER,
} from "./plain";
import {
  REGISTRY_EVENTS,
  STEP_ORDER,
  STEP_TITLE,
  verify,
  type ChainReader,
  type Overall,
  type RegistryEvent,
  type StepId,
  type VerifyResult,
} from "./verify";

const CONTRACT = "0xa8bb5dc1c031d850ab32768ed020e9aa604e1aae";
const NETWORK = networkName(43113);

const receipt = (event: RegistryEvent, overrides: Record<string, unknown> = {}) => ({
  chainId: "eip155:43113",
  contractAddress: CONTRACT,
  txId: `0x${"ab12".repeat(16)}`,
  status: "confirmed",
  event,
  ...overrides,
});

/** A chain that has never heard of the transaction, or cannot be reached. */
const chain = (missing: "transaction" | "network"): ChainReader => ({
  getChainId: async () => {
    if (missing === "network") throw new Error("fetch failed");
    return 43113;
  },
  getTransactionReceipt: async () => null,
});

const context = { chain: chain("transaction"), expectedChainId: 43113 };
const pinned = { ...context, expectedContractAddress: CONTRACT };
const digest = { kind: "digest", digest: `0x${"11".repeat(32)}` } as const;

/** A result as `verify` shapes it, for the outcomes that need a real ledger event. */
function result(
  overall: Overall,
  failed: StepId | null,
  facts: VerifyResult["facts"] = {},
): VerifyResult {
  return {
    overall,
    summary: "",
    steps: STEP_ORDER.map((id) => ({
      id,
      title: STEP_TITLE[id],
      status: id === failed ? "fail" : "pass",
      detail: "",
    })),
    facts,
    verifier: { chainId: 43113, expectedContractAddress: CONTRACT },
  };
}

const about = (event: RegistryEvent, noun = nounFor(event)) => ({
  event,
  noun,
  network: NETWORK,
});

describe("plainAnswer", () => {
  it("says Verified in the words of the mockup, with the right noun", () => {
    const photo = plainAnswer(
      result("VERIFIED", null),
      about("EvidenceRegistered", nounFor("EvidenceRegistered", "image/jpeg")),
    );
    expect(photo).toMatchObject({
      tone: "good",
      title: "Verified",
      body: "Avalanche has this exact photo on record. It has not been changed.",
    });
    expect(
      plainAnswer(result("VERIFIED", null), about("EvidenceRegistered")).body,
    ).toContain("this exact file");
    expect(
      plainAnswer(result("VERIFIED", null), about("ReportRegistered")).body,
    ).toContain("this exact report");
  });

  it("never lets a verified repair claim read as a verified repair", () => {
    const answer = plainAnswer(result("VERIFIED", null), about("RepairClaimed"));
    expect(answer.title).toBe("Verified");
    expect(answer.note).toMatch(/does not show that the repair was done/);
  });

  it("words an acknowledgement by whether the report was named", () => {
    const named = plainAnswer(
      result("VERIFIED", null, { reportIdExpected: `0x${"00".repeat(32)}` }),
      about("ReportAcknowledged"),
    );
    expect(named.body).toBe(
      "Avalanche has a record that the school acknowledged this report.",
    );
    const unnamed = plainAnswer(result("VERIFIED", null), about("ReportAcknowledged"));
    expect(unnamed.body).toMatch(/a school acknowledging a report in this transaction/);
  });

  it("tells a changed file from one recorded under another report", () => {
    const changed = plainAnswer(result("MISMATCH", "event"), about("EvidenceRegistered"));
    expect(changed).toMatchObject({ tone: "bad", title: "Not the same" });
    expect(changed.note).toMatch(/screenshot/);

    const other = plainAnswer(
      result("MISMATCH", "reportId"),
      about("EvidenceRegistered"),
    );
    expect(other.title).toBe("Recorded, but for a different report");

    const ack = plainAnswer(result("MISMATCH", "event"), about("ReportAcknowledged"));
    expect(ack.title).toBe("For a different report");
  });

  it("says No record found when the transaction does not exist", async () => {
    const found = await verify(
      { receipt: receipt("EvidenceRegistered"), source: digest },
      pinned,
    );
    expect(found.overall).toBe("NOT_FOUND");
    const answer = plainAnswer(found, about("EvidenceRegistered"));
    expect(answer).toMatchObject({ tone: "warn", title: "No record found" });
    expect(answer.body).toContain("Avalanche Fuji test network");
  });

  it("explains each reason a receipt is not accepted", async () => {
    const wrongContract = await verify(
      {
        receipt: receipt("EvidenceRegistered", {
          contractAddress: "0x2222222222222222222222222222222222222222",
        }),
        source: digest,
      },
      pinned,
    );
    expect(wrongContract.overall).toBe("REJECTED");
    expect(plainAnswer(wrongContract, about("EvidenceRegistered")).title).toBe(
      "Not a BonaWork record",
    );

    const wrongChain = await verify(
      {
        receipt: receipt("EvidenceRegistered", { chainId: "eip155:1" }),
        source: digest,
      },
      pinned,
    );
    expect(wrongChain.overall).toBe("REJECTED");
    expect(plainAnswer(wrongChain, about("EvidenceRegistered")).title).toBe(
      "This receipt is for another network",
    );

    const damaged = await verify(
      { receipt: { event: "Transfer" }, source: digest },
      pinned,
    );
    expect(damaged.overall).toBe("REJECTED");
    expect(plainAnswer(damaged, about("EvidenceRegistered")).title).toBe(
      "This receipt cannot be checked",
    );
  });

  it("makes no claim when the network cannot be reached", async () => {
    const unreachable = await verify(
      { receipt: receipt("EvidenceRegistered"), source: digest },
      { ...pinned, chain: chain("network") },
    );
    expect(unreachable.overall).toBe("CANNOT_VERIFY");
    const answer = plainAnswer(unreachable, about("EvidenceRegistered"));
    expect(answer).toMatchObject({ tone: "neutral", title: "Could not check right now" });
    expect(answer.note).toMatch(/says nothing about your file/);
  });

  it("has an answer in plain words for every result and every kind of record", () => {
    const overalls: [Overall, StepId | null][] = [
      ["VERIFIED", null],
      ["MISMATCH", "event"],
      ["MISMATCH", "reportId"],
      ["NOT_FOUND", "transaction"],
      ["NOT_FOUND", "event"],
      ["REJECTED", "receipt"],
      ["REJECTED", "chain"],
      ["REJECTED", "contract"],
      ["REJECTED", "transaction"],
      ["CANNOT_VERIFY", "network"],
      ["CANNOT_VERIFY", "transaction"],
    ];
    for (const event of REGISTRY_EVENTS) {
      for (const [overall, failed] of overalls) {
        const answer = plainAnswer(result(overall, failed), about(event));
        const words = `${answer.title} ${answer.body} ${answer.note ?? ""}`;
        expect(answer.title.length, words).toBeGreaterThan(3);
        // Plain words: no result codes, no jargon, and never a claim about mainnet.
        expect(words).not.toMatch(
          /VERIFIED|MISMATCH|NOT_FOUND|REJECTED|CANNOT_VERIFY|mainnet|hash|digest|commitment|RPC|0x/,
        );
        expect(answer.tone === "good").toBe(overall === "VERIFIED");
      }
    }
  });
});

describe("names and labels", () => {
  it("names only the Fuji test network", () => {
    expect(networkName(43113)).toBe("Avalanche Fuji test network");
    expect(networkName(43114)).toBe("network eip155:43114");
    expect(networkName(31337)).toBe("network eip155:31337");
  });

  it("has a name for every kind of record", () => {
    for (const event of REGISTRY_EVENTS) {
      expect(RECORD_NAME[event]).toMatch(/^A /);
      expect(nounFor(event).length).toBeGreaterThan(3);
    }
    expect(nounFor("EvidenceRegistered", "image/png")).toBe("photo");
    expect(nounFor("EvidenceRegistered", "application/pdf")).toBe("file");
    expect(nounFor("ReportRegistered", "image/png")).toBe("report");
  });

  it("explains all six results in the guide", () => {
    expect(OUTCOME_GUIDE.map((row) => row.outcome)).toEqual([
      "VERIFIED",
      "RECORDED",
      "MISMATCH",
      "NOT_FOUND",
      "REJECTED",
      "CANNOT_VERIFY",
    ]);
  });

  it("is honest about a sample", () => {
    expect(SAMPLE_ANSWER.tone).toBe("sample");
    expect(SAMPLE_ANSWER.body).toMatch(/did not call the network/);
    expect(SAMPLE_ANSWER.note).toMatch(/not a Verified result/);
  });

  it("formats the time a record was made", () => {
    expect(formatRecordedAt("2026-11-18T08:17:00.000Z", "Africa/Johannesburg")).toBe(
      "18 Nov 2026, 10:17",
    );
    expect(formatRecordedAt("not a date")).toBe("not a date");
  });
});
