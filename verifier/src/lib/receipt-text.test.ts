import { describe, expect, it } from "vitest";
import {
  eventFromReceiptText,
  formatBytes,
  isSampleReceipt,
  modeForEvent,
  receiptTextFromScan,
} from "./receipt-text";

describe("receipt text helpers", () => {
  it("reads the event from receipt text and ignores anything else", () => {
    expect(eventFromReceiptText('{"event":"EvidenceRegistered"}')).toBe(
      "EvidenceRegistered",
    );
    expect(eventFromReceiptText('{"event":"Transfer"}')).toBeNull();
    expect(eventFromReceiptText("not json")).toBeNull();
    expect(eventFromReceiptText("")).toBeNull();
  });

  it("chooses what the holder must supply from the event", () => {
    expect(modeForEvent("EvidenceRegistered")).toBe("evidence");
    expect(modeForEvent("ReportAcknowledged")).toBe("acknowledgement");
    for (const event of [
      "ReportRegistered",
      "InterimProtectionRecorded",
      "RepairClaimed",
      "RepairVerified",
      "RepairDisputed",
    ] as const) {
      expect(modeForEvent(event)).toBe("document");
    }
  });

  it("recognises a sample receipt by its own say-so or the memory ledger", () => {
    expect(isSampleReceipt({ sample: true, txId: null })).toBe(true);
    expect(isSampleReceipt({ chainId: "bona:memory", txId: null })).toBe(true);
    expect(isSampleReceipt({ chainId: "eip155:43113", txId: "0xabc" })).toBe(false);
    expect(isSampleReceipt(null)).toBe(false);
    expect(isSampleReceipt("sample")).toBe(false);
  });

  it("extracts the JSON object from scanned or pasted text", () => {
    expect(receiptTextFromScan('  {"a":1}\n')).toBe('{"a":1}');
    expect(receiptTextFromScan('https://verify.example/#{"a":1}')).toBe('{"a":1}');
    expect(receiptTextFromScan("plain")).toBe("plain");
  });

  it("formats sizes for people", () => {
    expect(formatBytes(512)).toBe("512 bytes");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
