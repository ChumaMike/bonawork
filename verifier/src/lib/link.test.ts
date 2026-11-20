import { describe, expect, it } from "vitest";
import { readVerifyFragment } from "./link";

const CONTRACT = "0xa8bb5dc1c031d850ab32768ed020e9aa604e1aae";
const TX = `0x${"ab12".repeat(16)}`;
const REPORT_ID = "123e4567-e89b-42d3-a456-426614174000";

const b64 = (bytes: Uint8Array | string) =>
  Buffer.from(bytes as never).toString("base64url");
const hex = (value: string) => Buffer.from(value.replace(/^0x|-/g, ""), "hex");

/** Build a fragment the way BonaBlock does, without importing BonaBlock. */
function fragment(parts: {
  chain?: string;
  event?: string;
  contract?: string;
  tx?: string;
  report?: string;
  label?: string;
  document?: string;
}): string {
  const fields = [
    "v1",
    parts.chain ?? "43113",
    parts.event ?? "E",
    parts.contract ?? b64(hex(CONTRACT)),
    parts.tx ?? b64(hex(TX)),
    parts.report ?? "",
    parts.label ?? "",
    parts.document ?? "",
  ];
  while (fields[fields.length - 1] === "") fields.pop();
  return `#${fields.join(".")}`;
}

const RECEIPT = {
  chainId: "eip155:43113",
  contractAddress: CONTRACT,
  txId: TX,
  event: "EvidenceRegistered",
};

describe("readVerifyFragment", () => {
  it("reads the link BonaBlock builds", () => {
    // The same string is pinned in the app's src/lib/verify-link.test.ts.
    const link =
      "https://bona-verify.vercel.app/#v1.43113.E.qLtdwcAx2FCrMnaO0CDpqmBOGq4.qxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxKrEqsSqxI.Ej5FZ-ibQtOkVkJmFBdAAA.UGhvdG8gMQ";
    const expected = {
      kind: "link",
      link: { receipt: RECEIPT, reportId: REPORT_ID, label: "Photo 1" },
    };
    expect(readVerifyFragment(link)).toEqual(expected);
    // As the browser hands it over: only the part from "#".
    expect(readVerifyFragment(new URL(link).hash)).toEqual(expected);
    expect(readVerifyFragment(new URL(link).hash.slice(1))).toEqual(expected);
  });

  it("treats an address with no fragment as a plain visit", () => {
    expect(readVerifyFragment("")).toEqual({ kind: "none" });
    expect(readVerifyFragment("#")).toEqual({ kind: "none" });
    expect(readVerifyFragment("https://bona-verify.vercel.app/#")).toEqual({
      kind: "none",
    });
  });

  it("reads the least a link can hold", () => {
    expect(readVerifyFragment(fragment({}))).toEqual({
      kind: "link",
      link: { receipt: RECEIPT },
    });
  });

  it("knows every event letter", () => {
    const events: Record<string, string> = {
      E: "EvidenceRegistered",
      R: "ReportRegistered",
      A: "ReportAcknowledged",
      P: "InterimProtectionRecorded",
      C: "RepairClaimed",
      V: "RepairVerified",
      D: "RepairDisputed",
    };
    for (const [code, event] of Object.entries(events)) {
      const read = readVerifyFragment(fragment({ event: code }));
      expect(read.kind === "link" && read.link.receipt.event, code).toBe(event);
    }
  });

  it("carries a label with no report, and any chain number", () => {
    const read = readVerifyFragment(
      fragment({ chain: "31337", label: b64("Photo 1 · report BB-2026-000042") }),
    );
    expect(read).toEqual({
      kind: "link",
      link: {
        receipt: { ...RECEIPT, chainId: "eip155:31337" },
        label: "Photo 1 · report BB-2026-000042",
      },
    });
  });

  it("makes an untrusted label one short line", () => {
    const read = readVerifyFragment(
      fragment({ label: b64(`Photo\n1\u0000 ${"x".repeat(500)}`) }),
    );
    if (read.kind !== "link") throw new Error("not a link");
    expect(read.link.label?.startsWith("Photo 1 x")).toBe(true);
    expect(read.link.label?.length).toBeLessThanOrEqual(80);
  });

  it("carries a commitment document exactly", () => {
    const document = {
      type: "report",
      reportId: REPORT_ID,
      title: "Toilets in block B have no water",
      description: "Since Monday — “no water”.\nLine two.",
      salt: `0x${"5a".repeat(32)}`,
    };
    const read = readVerifyFragment(
      fragment({ event: "R", document: b64(JSON.stringify(document)) }),
    );
    expect(read).toEqual({
      kind: "link",
      link: { receipt: { ...RECEIPT, event: "ReportRegistered" }, document },
    });
  });

  it("keeps the record when only the document was damaged", () => {
    const whole = b64(JSON.stringify({ type: "report", salt: "0x00" }));
    for (const damaged of [whole.slice(0, 20), "!!!", b64("[1,2]"), b64("not json")]) {
      expect(
        readVerifyFragment(fragment({ event: "R", document: damaged })),
        damaged,
      ).toEqual({
        kind: "link",
        link: {
          receipt: { ...RECEIPT, event: "ReportRegistered" },
          documentDamaged: true,
        },
      });
    }
  });

  it("refuses what it does not understand, without throwing", () => {
    for (const bad of [
      "#v2.43113.E.x.y",
      "#v1",
      "#v1.",
      "#hello",
      "#https://example.org",
      fragment({ chain: "fuji" }),
      fragment({ chain: "0" }),
      fragment({ event: "X" }),
      fragment({ event: "e" }),
      fragment({ contract: b64(hex(TX)) }),
      fragment({ contract: "" }),
      fragment({ tx: b64(hex(CONTRACT)) }),
      fragment({ tx: "not base64!" }),
      fragment({ report: b64(hex(CONTRACT)) }),
      `#v1.${"A".repeat(70_000)}`,
    ]) {
      expect(readVerifyFragment(bad), bad.slice(0, 40)).toEqual({ kind: "unreadable" });
    }
  });

  it("hands over an older link that holds the receipt text itself", () => {
    const json = JSON.stringify({ ...RECEIPT, status: "confirmed" });
    expect(readVerifyFragment(`#${encodeURIComponent(json)}`)).toEqual({
      kind: "json",
      text: json,
    });
    expect(readVerifyFragment(`https://verify.example/#${json}`)).toEqual({
      kind: "json",
      text: json,
    });
  });
});
