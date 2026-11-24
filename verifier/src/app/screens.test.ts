import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { networkName } from "../lib/plain";
import { readRecord } from "../lib/record";
import {
  STEP_ORDER,
  STEP_TITLE,
  type Overall,
  type StepId,
  type VerifyResult,
} from "../lib/verify";
import { Checker, type Arrived } from "./checker";
import { ResultView, type Outcome, type Trust } from "./result";
import { Landing, VerifyApp } from "./verify-app";

/*
 * The screens as first drawn, before anyone touches them. These tests pin the
 * rules of the simplified design: one answer in plain words, nothing technical
 * unless "Technical details" is opened, no choice of record type, and never a
 * claim that this is mainnet.
 */

const CONTRACT = "0xa8bb5dc1c031d850ab32768ed020e9aa604e1aae";
const TX = `0x${"ab12".repeat(16)}`;
const DIGEST = `0x${"11".repeat(32)}`;

const trust: Trust = {
  chainId: 43113,
  network: networkName(43113),
  rpcHost: "api.avax-test.network",
  contract: CONTRACT,
};

const RECEIPT = {
  chainId: "eip155:43113",
  contractAddress: CONTRACT,
  txId: TX,
  status: "confirmed",
  event: "EvidenceRegistered",
};

const LINK =
  "https://bona-verify.vercel.app/#v1.43113.E.qLtdwcAx2FCrMnaO0CDpqmBOGq4.qxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxI.Ej5FZ-ibQtOkVkJmFBdAAA.UGhvdG8gMQ";

function arrivedWith(text: string): Arrived {
  const read = readRecord(text);
  if (read.kind !== "record" && read.kind !== "sample") throw new Error(read.kind);
  return read;
}

function result(overall: Overall, failed: StepId | null): VerifyResult {
  return {
    overall,
    summary: "Summary from the engine.",
    steps: STEP_ORDER.map((id) => ({
      id,
      title: STEP_TITLE[id],
      status: id === failed ? "fail" : "pass",
      detail: `Detail for ${id}.`,
    })),
    facts: {
      chainId: 43113,
      contractAddress: CONTRACT,
      txHash: TX,
      explorerUrl: `https://testnet.snowtrace.io/tx/${TX}`,
      recomputedDigest: DIGEST as `0x${string}`,
      blockNumber: 48_123_456,
      eventName: "EvidenceRegistered",
      eventTimestamp: "2026-11-18T08:17:00.000Z",
    },
    verifier: { chainId: 43113, expectedContractAddress: CONTRACT },
  };
}

const outcomeFor = (overall: Overall, failed: StepId | null): Outcome => ({
  kind: "result",
  result: result(overall, failed),
  event: "EvidenceRegistered",
  noun: "photo",
  receipt: RECEIPT,
  label: "Photo 1",
});

const draw = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
const noop = () => {};

/** The markup a person sees without opening anything: every <details> body removed. */
function closed(html: string): string {
  return html.replace(/<details[\s\S]*?<\/details>/g, (details) => {
    expect(details.startsWith("<details open"), "details must start closed").toBe(false);
    return details.match(/<summary[\s\S]*?<\/summary>/)?.[0] ?? "";
  });
}

/** The words a person reads without opening anything: no tags, no attributes. */
const words = (html: string) => closed(html).replace(/<[^>]*>/g, " ");

const TECHNICAL =
  /0x[0-9a-f]{8}|eip155|RPC|VERIFIED|MISMATCH|NOT_FOUND|REJECTED|CANNOT_VERIFY|SHA-256|JSON/;

describe("opened with nothing", () => {
  it("draws a neutral placeholder on the server, which cannot see the fragment", () => {
    const html = draw(createElement(VerifyApp, { trust }));
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("<h1");
  });

  it("says to scan the code on a record, with pasting as the other way in", () => {
    const html = draw(
      createElement(Landing, {
        trust,
        unreadable: false,
        takeFocus: false,
        onPaste: noop,
      }),
    );
    expect(html).toContain("Scan the code on a BonaWork record");
    expect(html).toContain("Paste a receipt instead");
    expect(html).toContain("Avalanche Fuji test network");
    expect(html).not.toContain("could not be read");
    expect(words(html)).not.toMatch(TECHNICAL);
    // No form to fill in on this screen.
    expect(html).not.toMatch(/<input|<textarea|<select/);
  });

  it("says so when the link could not be read", () => {
    const html = draw(
      createElement(Landing, {
        trust,
        unreadable: true,
        takeFocus: false,
        onPaste: noop,
      }),
    );
    expect(html).toContain("That link or code could not be read");
  });
});

describe("paste a receipt instead", () => {
  const html = draw(createElement(Checker, { trust, onLeave: noop }));

  it("is two steps and one Check button, which waits for both", () => {
    expect(html).toContain("Check a record on Avalanche");
    expect(html).toContain("Paste receipt");
    expect(html).toContain("Your receipt");
    expect(html).toContain("Your photo or document");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Check<\/button>/);
    expect(html).toContain("Paste your receipt first.");
  });

  it("never asks what kind of record it is, or for a report id", () => {
    expect(html).not.toMatch(/type="radio"|<select/);
    expect(html).not.toMatch(/Evidence file|Commitment document|Report id/);
    expect(words(html)).not.toMatch(TECHNICAL);
  });

  it("names the test network and makes no claim about BonaWork", () => {
    expect(html).toContain(
      "This site does not ask BonaWork anything. It reads the Avalanche Fuji test network itself.",
    );
  });
});

describe("opened from a link or a square code", () => {
  it("shows the record already filled in and asks only for the file", () => {
    const html = draw(
      createElement(Checker, { trust, arrived: arrivedWith(LINK), onLeave: noop }),
    );
    expect(html).toContain("Check this record");
    expect(html).toMatch(/Checking<\/span>.*Photo 1/s);
    expect(html).toContain("Choose your photo or document");
    expect(html).toContain("It never leaves your device");
    expect(html).not.toContain("Paste receipt");
    expect(html).not.toMatch(/<textarea|type="radio"/);
    expect(words(html)).not.toMatch(TECHNICAL);
  });

  it("names the kind of record when the link carried no label", () => {
    const html = draw(
      createElement(Checker, {
        trust,
        arrived: arrivedWith(LINK.split(".").slice(0, -2).join(".")),
        onLeave: noop,
      }),
    );
    expect(html).toMatch(/Checking<\/span>.*A photo or file/s);
  });

  it("checks a record that is not a file at once when the link lacks its details, and offers to paste them", () => {
    const html = draw(
      createElement(Checker, {
        trust,
        arrived: arrivedWith(LINK.replace(".E.", ".C.")),
        onLeave: noop,
      }),
    );
    // The check starts without anything from the person: no dead end.
    expect(html).toContain("Reading Avalanche");
    // Pasting the details is still there, as a second step under the answer.
    expect(html).toContain("Do you hold this record?");
    expect(html).toContain("Paste the record&#x27;s details");
    expect(html).toContain("Copy document");
    expect(html).not.toContain("Choose your photo or document");
    expect(html.indexOf("Reading Avalanche")).toBeLessThan(
      html.indexOf("Do you hold this record?"),
    );
  });

  it("starts checking at once when nothing is needed from the person", () => {
    const html = draw(
      createElement(Checker, {
        trust,
        arrived: arrivedWith(LINK.replace(".E.", ".A.")),
        onLeave: noop,
      }),
    );
    expect(html).toContain("Reading Avalanche");
    expect(html).not.toMatch(/<input|<textarea/);
  });

  it("answers a sample receipt honestly, with no network result", () => {
    const sample = { sample: true, chainId: "bona:memory", txId: null };
    const html = draw(
      createElement(Checker, {
        trust,
        arrived: arrivedWith(JSON.stringify(sample)),
        onLeave: noop,
      }),
    );
    expect(html).toContain('data-outcome="SAMPLE"');
    expect(html).toContain("Sample record: nothing to check");
    expect(html).toContain("did not call the network");
    expect(html).not.toContain(">Verified<");
    expect(html).not.toContain("Reading Avalanche");
  });
});

describe("the answer", () => {
  it("is one big Verified, three facts and a Snowtrace link", () => {
    const html = draw(
      createElement(ResultView, { outcome: outcomeFor("VERIFIED", null), trust }),
    );
    const seen = closed(html);
    expect(seen).toContain('data-outcome="VERIFIED"');
    expect(seen).toMatch(/<h2[^>]*>Verified<\/h2>/);
    expect(seen).toContain(
      "Avalanche has this exact photo on record. It has not been changed.",
    );
    expect(seen).toMatch(/Recorded<\/dt>.*18 Nov 2026/s);
    expect(seen).toMatch(/By the BonaWork contract<\/dt>.*Yes/s);
    expect(seen).toMatch(/Network<\/dt>.*Avalanche Fuji test network/s);
    expect(seen).toContain("See it on Snowtrace");
    expect(seen).toContain(`href="https://testnet.snowtrace.io/tx/${TX}"`);
    // Everything technical waits behind the closed "Technical details".
    expect(seen).toContain("Technical details");
    expect(words(html)).not.toMatch(TECHNICAL);
  });

  it("keeps the precise code, fingerprint, transaction and receipt under Technical details", () => {
    const html = draw(
      createElement(ResultView, { outcome: outcomeFor("VERIFIED", null), trust }),
    );
    const details = html.slice(html.indexOf("<details"));
    for (const text of [
      "VERIFIED",
      DIGEST,
      TX,
      "48123456",
      "eip155:43113",
      CONTRACT,
      "api.avax-test.network",
      "Summary from the engine.",
      "Detail for transaction.",
      "&quot;txId&quot;",
    ]) {
      expect(details, text).toContain(text);
    }
  });

  it("does not say the contract was checked when this site pins none", () => {
    const outcome = outcomeFor("VERIFIED", null);
    if (outcome.kind !== "result") throw new Error("not a result");
    outcome.result.verifier.expectedContractAddress = null;
    const html = draw(
      createElement(ResultView, { outcome, trust: { ...trust, contract: null } }),
    );
    expect(closed(html)).toMatch(/By the BonaWork contract<\/dt>.*Not checked here/s);
  });

  it("gives each of the five results its own plain words", () => {
    const cases: [Overall, StepId, string][] = [
      ["MISMATCH", "event", "Not the same"],
      ["NOT_FOUND", "event", "No record found"],
      ["REJECTED", "contract", "Not a BonaWork record"],
      ["CANNOT_VERIFY", "network", "Could not check right now"],
    ];
    for (const [overall, failed, title] of cases) {
      const html = draw(
        createElement(ResultView, {
          outcome: outcomeFor(overall, failed),
          trust,
          onRetry: noop,
        }),
      );
      const seen = closed(html);
      expect(seen).toContain(`data-outcome="${overall}"`);
      expect(seen).toContain(`>${title}</h2>`);
      expect(seen).not.toContain(">Verified<");
      expect(seen).not.toContain("By the BonaWork contract");
      expect(seen.includes("Try again")).toBe(overall === "CANNOT_VERIFY");
      expect(html.slice(html.indexOf("<details"))).toContain(overall);
    }
  });

  it("announces the answer to assistive technology", () => {
    const html = draw(
      createElement(ResultView, { outcome: outcomeFor("VERIFIED", null), trust }),
    );
    expect(html).toMatch(/role="status" aria-live="polite"><div data-outcome/);
    // The region is in the page before there is an answer, so the change is announced.
    expect(draw(createElement(ResultView, { outcome: null, trust }))).toContain(
      'aria-live="polite"',
    );
  });

  it("never says or implies mainnet on any screen", () => {
    const screens = [
      draw(
        createElement(Landing, {
          trust,
          unreadable: true,
          takeFocus: false,
          onPaste: noop,
        }),
      ),
      draw(createElement(Checker, { trust, onLeave: noop })),
      draw(createElement(Checker, { trust, arrived: arrivedWith(LINK), onLeave: noop })),
      ...(
        ["VERIFIED", "MISMATCH", "NOT_FOUND", "REJECTED", "CANNOT_VERIFY"] as const
      ).map((overall) =>
        draw(createElement(ResultView, { outcome: outcomeFor(overall, "event"), trust })),
      ),
    ];
    for (const html of screens) {
      expect(html).not.toMatch(/mainnet|main network|not deployed|is deployed on/i);
    }
  });
});

describe("recorded on Avalanche: a link that carries no details", () => {
  const FACTORY = "0x9aa7cf8a0cd0c015f01df8fdb400510d1407d6e3";
  const FINANCE = "0x4c9b194ed628a9c5abc74767ef01e405d6d9f290";
  const FINGERPRINT = `0x${"c7".repeat(32)}`;
  const RELEASE_LINK = LINK.replace(".E.", ".Z.");

  /** The answer for a public link: the record is there, nothing was compared. */
  function recorded(
    event: "ReleaseAuthorised" | "MatchRecorded" | "ReportRegistered",
    facts: VerifyResult["facts"] = {},
  ): Outcome {
    const base = result("RECORDED", null);
    return {
      kind: "result",
      event,
      noun: "release authorisation",
      receipt: { ...RECEIPT, contractAddress: FINANCE, event },
      result: {
        ...base,
        facts: {
          ...base.facts,
          recomputedDigest: undefined,
          eventName: event,
          contractAddress: FINANCE,
          contractKind: "finance",
          onChainValue: FINGERPRINT as `0x${string}`,
          ...facts,
        },
        verifier: {
          chainId: 43113,
          expectedContractAddress: null,
          expectedFactoryAddress: FACTORY,
        },
      },
    };
  }

  it("starts the check at once and keeps pasting as a second step", () => {
    const html = draw(
      createElement(Checker, {
        trust,
        arrived: arrivedWith(RELEASE_LINK),
        onLeave: noop,
      }),
    );
    expect(html).toContain("Check this record");
    expect(html).toContain("Reading Avalanche");
    // The person is not asked for anything before the answer.
    expect(html).toContain("Do you hold this record?");
    expect(html.indexOf("Reading Avalanche")).toBeLessThan(
      html.indexOf("Do you hold this record?"),
    );
    expect(html).toContain("Paste the record&#x27;s details");
    // No text box is open: nothing has to be typed to get the answer.
    expect(html).not.toMatch(/<textarea/);
    expect(html).not.toContain(">Verified<");
    expect(words(html)).not.toMatch(TECHNICAL);
  });

  it("runs the full check, not the recorded one, when the link carries the details", () => {
    const document = {
      type: "release_decision",
      releaseId: "4fb05162-7384-4e9f-a0a1-b2c3d4e5f607",
      workOrderId: "0b7c1d2e-3f40-4a5b-8c6d-7e8f90a1b2c3",
      reportId: "123e4567-e89b-42d3-a456-426614174000",
      matchCommitment: `0x${"b1".repeat(32)}`,
      reviewCommitment: `0x${"b2".repeat(32)}`,
      decision: "authorised",
      createdAt: "2026-11-20T08:00:00.000Z",
      salt: `0x${"5a".repeat(32)}`,
    };
    const encoded = Buffer.from(JSON.stringify(document), "utf8").toString("base64url");
    const html = draw(
      createElement(Checker, {
        trust,
        arrived: arrivedWith(`${RELEASE_LINK}.${encoded}`),
        onLeave: noop,
      }),
    );
    expect(html).toContain("Reading Avalanche");
    expect(html).toContain("The record’s details are here");
    expect(html).not.toContain("Do you hold this record?");
    expect(html).not.toContain("Paste the record&#x27;s details");
  });

  it("is one plain answer that says exactly what was checked", () => {
    const html = draw(
      createElement(ResultView, { outcome: recorded("ReleaseAuthorised"), trust }),
    );
    const seen = closed(html);
    expect(seen).toContain('data-outcome="RECORDED"');
    expect(seen).toMatch(/<h2[^>]*>Recorded on Avalanche<\/h2>/);
    expect(seen).toContain(
      "A release authorisation was recorded on the Avalanche Fuji test network, by a contract that the BonaWork factory created.",
    );
    expect(seen).toContain(
      "This shows the step was recorded and by which contract. The details (amounts, names, documents) are private. Someone who holds the record can paste it here to check that it matches this fingerprint.",
    );
    // The step, when, where, by which contract, and the fingerprint from the event itself.
    expect(seen).toMatch(/Step<\/dt>.*Release authorisation/s);
    expect(seen).toMatch(/Recorded<\/dt>.*18 Nov 2026/s);
    expect(seen).toMatch(/Block<\/dt>.*48123456/s);
    expect(seen).toMatch(new RegExp(`Contract</dt>.*${FINANCE}`, "s"));
    expect(seen).toMatch(/Created by the BonaWork factory<\/dt>.*Yes/s);
    expect(seen).toMatch(
      new RegExp(`Fingerprint on the blockchain</dt>.*${FINGERPRINT}`, "s"),
    );
    expect(seen).toMatch(/Network<\/dt>.*Avalanche Fuji test network/s);
    expect(seen).toContain("See it on Snowtrace");
    expect(seen).toContain(`href="https://testnet.snowtrace.io/tx/${TX}"`);
    // It is not a Verified answer, and it claims nothing about the content or about money.
    expect(seen).not.toContain(">Verified<");
    expect(seen).not.toMatch(/this exact|has not been changed/);
    expect(words(html)).not.toMatch(/\bpaid\b|resolved|mainnet/i);
    // The precise result code stays under Technical details.
    expect(words(html)).not.toMatch(/RECORDED|VERIFIED|eip155|RPC|JSON/);
    expect(html.slice(html.indexOf("<details"))).toContain("RECORDED");
  });

  it("says whether the rules passed or blocked the invoice for a match", () => {
    const blocked = closed(
      draw(
        createElement(ResultView, {
          outcome: recorded("MatchRecorded", { matchPassed: false }),
          trust,
        }),
      ),
    );
    expect(blocked).toMatch(/Step<\/dt>.*Three-way match result/s);
    expect(blocked).toMatch(/Result<\/dt>.*The rules blocked this invoice/s);
    expect(blocked).toContain("The rules blocked this invoice.");

    const passed = closed(
      draw(
        createElement(ResultView, {
          outcome: recorded("MatchRecorded", { matchPassed: true }),
          trust,
        }),
      ),
    );
    expect(passed).toMatch(/Result<\/dt>.*The rules passed this invoice/s);
  });

  it("does not say the contract was checked when this site pins none", () => {
    const outcome = recorded("ReportRegistered", { contractKind: undefined });
    if (outcome.kind !== "result") throw new Error("not a result");
    outcome.result.verifier = { chainId: 43113, expectedContractAddress: null };
    const seen = closed(
      draw(createElement(ResultView, { outcome, trust: { ...trust, contract: null } })),
    );
    expect(seen).toContain("Recorded on Avalanche");
    expect(seen).toMatch(/By the BonaWork contract<\/dt>.*Not checked here/s);
    expect(seen).toContain("does not show that it is a BonaWork record");
  });

  it("shows a rejection, never Recorded, for a contract the factory did not create", () => {
    const outcome = recorded("ReleaseAuthorised");
    if (outcome.kind !== "result") throw new Error("not a result");
    outcome.result = {
      ...result("REJECTED", "contract"),
      facts: { contractAddress: FINANCE, eventName: "ReleaseAuthorised" },
      verifier: outcome.result.verifier,
    };
    const seen = closed(draw(createElement(ResultView, { outcome, trust })));
    expect(seen).toContain('data-outcome="REJECTED"');
    expect(seen).toContain(">Not a BonaWork record</h2>");
    expect(seen).toContain("This contract was not created by the BonaWork factory.");
    expect(seen).not.toContain("Recorded on Avalanche");
    expect(seen).not.toContain("recorded-facts");
  });
});
