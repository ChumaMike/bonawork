"use client";

import { useState } from "react";
import { getApi } from "@/data/api";
import type { LedgerRecord, RecordProof } from "@/data/types";
import { useMessages } from "@/i18n";
import { cn } from "./ui/cn";
import { Icon } from "./ui/icon";

/** The separate verifier app. Falls back to this app's own check page. */
export const VERIFY_URL = process.env.NEXT_PUBLIC_VERIFY_URL || "/verify";

type Part = "receipt" | "document";
type State = "idle" | "working" | "copied" | "missing" | "failed";

class NothingToCopy extends Error {}

const ACTION =
  "no-print inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-strong hover:bg-brand-soft";

/**
 * What BonaBlock Verify needs for one ledger record: "Copy receipt", and
 * "Copy document" for records anchored as a salted commitment document.
 * Each is fetched when asked for and copied as JSON, exactly as the verifier
 * expects it to be pasted.
 */
export function ReceiptActions({
  issueId,
  recordId,
  label,
  ledger,
  withDocument = false,
}: {
  issueId: string;
  /** An evidence id or a timeline event id. */
  recordId: string;
  /** What the record is, for screen readers, e.g. "Evidence 2". */
  label: string;
  /** The record's ledger state. A real receipt is copied from here, with no request. */
  ledger: LedgerRecord;
  /** True for reports, protections, repair claims and reviews. Not for evidence files. */
  withDocument?: boolean;
}) {
  const m = useMessages();
  const [states, setStates] = useState<Record<Part, State>>({
    receipt: "idle",
    document: "idle",
  });
  const set = (part: Part, state: State) =>
    setStates((current) => ({ ...current, [part]: state }));

  async function copy(part: Part) {
    set(part, "working");
    // The page already holds a real receipt; only documents and fixture
    // samples have to be asked for.
    const proof: Promise<RecordProof | null> =
      part === "receipt" && ledger.source === "ledger"
        ? Promise.resolve({ receipt: ledger.receipt })
        : getApi().getRecordProof(issueId, recordId);
    const text = proof.then((found) => {
      const value = found?.[part];
      if (!value) throw new NothingToCopy();
      return JSON.stringify(value, null, 2);
    });
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        // Safari only allows a clipboard write inside the tap itself, so it is
        // given the pending text rather than being called after the fetch.
        const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        await navigator.clipboard.writeText(await text);
      }
      set(part, "copied");
    } catch {
      // Find out which step failed: nothing to copy, or the copy itself.
      const missing = await text.then(
        () => false,
        (error) => error instanceof NothingToCopy,
      );
      set(part, missing ? "missing" : "failed");
    }
  }

  const copy_ = {
    receipt: {
      action: m.ledger.copyReceipt,
      done: m.ledger.receiptCopied,
      missing: m.ledger.receiptMissing,
    },
    document: {
      action: m.ledger.copyDocument,
      done: m.ledger.documentCopied,
      missing: m.ledger.documentMissing,
    },
  };
  const parts: Part[] = withDocument ? ["receipt", "document"] : ["receipt"];
  const copied = parts.some((part) => states[part] === "copied");
  const problem = parts.find(
    (part) => states[part] === "missing" || states[part] === "failed",
  );
  const external = /^https?:/.test(VERIFY_URL);

  return (
    <div data-testid="receipt-actions" className="-mx-3 flex flex-wrap items-center">
      {parts.map((part) => (
        <button
          key={part}
          type="button"
          onClick={() => copy(part)}
          disabled={states[part] === "working"}
          aria-label={`${copy_[part].action}: ${label}`}
          className={cn(ACTION, "disabled:opacity-60")}
        >
          <Icon name={states[part] === "copied" ? "check" : "copy"} className="size-4" />
          <span aria-live="polite">
            {states[part] === "copied" ? copy_[part].done : copy_[part].action}
          </span>
        </button>
      ))}
      {/* The next step only makes sense once something is on the clipboard. */}
      {copied ? (
        <a
          href={VERIFY_URL}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={ACTION}
        >
          <Icon name="shieldCheck" className="size-4" />
          {m.ledger.openInVerify}
        </a>
      ) : null}
      {problem ? (
        <p role="status" className="basis-full px-3 text-sm text-danger">
          {states[problem] === "missing"
            ? copy_[problem].missing
            : m.ledger.receiptCopyFailed}
        </p>
      ) : null}
    </div>
  );
}
