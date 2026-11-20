import { EVENT_RULE, REGISTRY_EVENTS, type RegistryEvent } from "./verify";

/** What the holder must supply next to a receipt, decided by the receipt's event. */
export type Mode = "evidence" | "document" | "acknowledgement";

export const MODE_LABEL: Record<Mode, string> = {
  evidence: "Evidence file",
  document: "Commitment document",
  acknowledgement: "Acknowledgement",
};

export function modeForEvent(event: RegistryEvent): Mode {
  const rule = EVENT_RULE[event];
  if (rule.field === "digest") return "evidence";
  // Nothing to hand over: the event carries no fingerprint, or (a payment
  // dispute) no document format is published for it. Its presence is checked.
  if (rule.field === null || rule.document === null) return "acknowledgement";
  return "document";
}

/** The registry event named in receipt text, or null when the text is not a receipt. */
export function eventFromReceiptText(text: string): RegistryEvent | null {
  try {
    const parsed = JSON.parse(text) as { event?: unknown };
    const event = parsed?.event;
    return typeof event === "string" &&
      (REGISTRY_EVENTS as readonly string[]).includes(event)
      ? (event as RegistryEvent)
      : null;
  } catch {
    return null;
  }
}

/**
 * A receipt from the BonaBlock preview or its in-memory ledger. It says so
 * itself (`sample: true` or the `bona:memory` chain) and carries no
 * transaction, so there is nothing on any network to look up.
 */
export function isSampleReceipt(receipt: unknown): boolean {
  if (!receipt || typeof receipt !== "object") return false;
  const r = receipt as { sample?: unknown; chainId?: unknown };
  return r.sample === true || r.chainId === "bona:memory";
}

/** Receipt text that arrived by QR code or paste may be wrapped in whitespace or a URL fragment. */
export function receiptTextFromScan(raw: string): string {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n.toLocaleString()} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
