"use client";

import { useEffect, useState } from "react";
import { LedgerPanel } from "@/components/ledger-state";
import { ReceiptActions } from "@/components/receipt-actions";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { cn } from "@/components/ui/cn";
import { CopyButton } from "@/components/ui/copy-button";
import { Icon } from "@/components/ui/icon";
import { VerifyQr } from "@/components/verify-qr";
import { getApi } from "@/data/api";
import type { LedgerRecord } from "@/data/types";
import { useMessages } from "@/i18n";
import { verifyLink } from "@/lib/verify-link";

/**
 * "Show proof". Pages say one word about a record ("Recorded"); everything a
 * careful person, a journalist or a judge wants is one tap away in a sheet:
 * what was written to Avalanche and when, the file's fingerprint, a link and a
 * square code that open the independent verifier with this record filled in,
 * and the raw receipt to copy.
 *
 * Renders nothing for a record with neither a ledger entry nor a fingerprint.
 */
export function ProofButton({
  issueId,
  recordId,
  label,
  ledger,
  digest,
  withDocument = false,
  reportId,
  className,
}: {
  issueId: string;
  /** An evidence id or a timeline event id. */
  recordId: string;
  /** What the record is, in words: "Evidence 2", "Repair claimed". */
  label: string;
  ledger: LedgerRecord;
  /** The file's SHA-256 fingerprint, for evidence. */
  digest?: string;
  /** True for reports, protections, repair claims and reviews. */
  withDocument?: boolean;
  /** The report's id, which the verifier needs for some record types. */
  reportId?: string;
  className?: string;
}) {
  const m = useMessages();
  const [open, setOpen] = useState(false);

  // A report, protection, claim or review is checked against its commitment
  // document. It is fetched when the sheet opens and travels in the link, so
  // the verifier has everything and the person has nothing to paste.
  const needsDocument = withDocument && ledger.source === "ledger";
  const [document, setDocument] = useState<unknown>(undefined);
  useEffect(() => {
    if (!open || !needsDocument) return;
    let current = true;
    getApi()
      .getRecordProof(issueId, recordId)
      .then(
        (proof) => current && setDocument(proof?.document ?? null),
        () => current && setDocument(null),
      );
    return () => {
      current = false;
    };
  }, [open, needsDocument, issueId, recordId]);

  const href =
    ledger.source === "ledger" && (!needsDocument || document !== undefined)
      ? verifyLink(ledger.receipt, { label, reportId, document: document ?? undefined })
      : null;

  if (ledger.source === "none" && !digest) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${m.ledger.showProof}: ${label}`}
        data-testid="show-proof"
        className={cn(
          "no-print inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-strong hover:bg-brand-soft",
          className,
        )}
      >
        <Icon name="shieldCheck" className="size-4" />
        {m.ledger.showProof}
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={m.ledger.proofTitle(label)}
        description={m.ledger.proofIntro}
      >
        {open ? (
          <div className="flex flex-col gap-5" data-testid="proof-sheet">
            <LedgerPanel record={ledger} />

            {digest ? (
              <div>
                <p className="font-semibold">{m.ledger.fingerprint}</p>
                <p className="text-sm text-muted">{m.ledger.fingerprintHelp}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2">
                  <code className="font-mono text-sm break-all">{digest}</code>
                  <CopyButton
                    value={digest}
                    label={`${m.ledger.fingerprint}, ${label}`}
                  />
                </div>
              </div>
            ) : null}

            {href ? (
              <div className="rounded-2xl border border-line bg-surface p-4">
                <p className="font-semibold">{m.ledger.checkElsewhere}</p>
                <p className="mt-1 text-sm text-muted">{m.ledger.checkElsewhereHelp}</p>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <VerifyQr href={href} size={168} className="shrink-0 text-ink" />
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="verify-link"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-brand px-4 font-semibold text-brand-strong hover:bg-brand-soft"
                  >
                    {m.ledger.openInVerify}
                    <Icon name="arrowRight" className="size-4" />
                  </a>
                </div>
              </div>
            ) : null}

            <details className="rounded-2xl border border-line px-4 py-1">
              <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
                {m.ledger.technical}
              </summary>
              <div className="pb-3">
                <p className="text-sm text-muted">{m.ledger.technicalHelp}</p>
                {ledger.source !== "none" ? (
                  <ReceiptActions
                    issueId={issueId}
                    recordId={recordId}
                    label={label}
                    ledger={ledger}
                    withDocument={withDocument}
                  />
                ) : null}
              </div>
            </details>
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}
