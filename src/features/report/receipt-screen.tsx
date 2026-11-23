"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { EvidenceList } from "@/components/evidence-list";
import { LedgerChip } from "@/components/ledger-state";
import { ProofButton } from "@/components/proof/proof-button";
import { Button, ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Icon } from "@/components/ui/icon";
import { NotFound, PageError, PageLoading, PageShell } from "@/components/ui/page";
import { toast } from "@/components/ui/toast";
import { getApi } from "@/data/api";
import type { SubmissionReceipt } from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import { formatDate } from "@/lib/format";
import { rememberReference } from "../track/recent";

/** "Share" uses the phone's own share sheet; elsewhere it copies the link and says so. */
function ShareButton({ receipt }: { receipt: SubmissionReceipt }) {
  const m = useMessages();

  async function share() {
    const url = `${window.location.origin}/issues/${receipt.issueId}`;
    const text = m.receipt.shareText(receipt.reference);
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: m.receipt.shareCopied, tone: "success" });
    } catch {
      // The share sheet was dismissed, or the clipboard is blocked: the link is on screen.
    }
  }

  return (
    <Button variant="secondary" onClick={share} className="no-print w-full">
      <Icon name="link" />
      {m.receipt.share}
    </Button>
  );
}

/**
 * What a person sees right after sending a report: a slip to keep, like the
 * one from a clinic or a shop, and three lines on what happens next. The
 * technical record sits behind "Show proof".
 */
export function ReceiptScreen() {
  const m = useMessages();
  const r = m.receipt;
  const { reference } = useParams<{ reference: string }>();
  const query = useQuery(`receipt:${reference}`, () =>
    getApi().getSubmissionReceipt(reference),
  );
  const receipt = query.data ?? null;

  // This phone remembers the report, so Track can reopen it without typing.
  useEffect(() => {
    if (receipt) {
      rememberReference({
        reference: receipt.reference,
        issueId: receipt.issueId,
        title: receipt.title,
      });
    }
  }, [receipt]);

  if (query.error) return <PageError onRetry={query.reload} />;
  if (query.data === undefined) return <PageLoading width="narrow" size="compact" />;
  if (receipt === null) {
    return (
      <NotFound>
        <div className="flex flex-col items-center gap-4 text-center">
          <p>{r.notFound}</p>
          <ButtonLink href="/track">{m.track.title}</ButtonLink>
        </div>
      </NotFound>
    );
  }

  return (
    <PageShell
      eyebrow={m.shell.eyebrow.receipt}
      title={r.title}
      intro={r.intro}
      size="compact"
      className="grid gap-8 lg:grid-cols-2 lg:items-start"
    >
      <div className="flex min-w-0 flex-col gap-5">
        {/* The slip to screenshot: the number first, large, on its own. */}
        <div
          data-testid="receipt-card"
          className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted">{r.reference}</p>
            <LedgerChip record={receipt.ledger} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2">
            <p
              data-testid="receipt-reference"
              className="font-mono text-[clamp(1.5rem,7.5vw,2.25rem)] font-medium whitespace-nowrap"
            >
              {receipt.reference}
            </p>
            <CopyButton value={receipt.reference} label={r.reference} />
          </div>
          <dl className="mt-4 grid gap-3 border-t border-line pt-4">
            <div>
              <dt className="text-sm text-muted">{r.school}</dt>
              <dd className="font-medium">{receipt.schoolName}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{r.problem}</dt>
              <dd className="font-medium">{receipt.title}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">{r.sent}</dt>
              <dd className="font-medium">{formatDate(receipt.submittedAt)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted">
            {m.brand.name} · {m.brand.tagline}
          </p>
        </div>
        <p className="no-print -mt-2 text-sm text-muted">{r.screenshotHint}</p>

        <ButtonLink
          href={`/issues/${receipt.issueId}`}
          size="lg"
          className="no-print w-full"
        >
          {r.track}
          <Icon name="arrowRight" />
        </ButtonLink>

        <div className="no-print grid grid-cols-2 gap-3">
          <ShareButton receipt={receipt} />
          <Button variant="secondary" onClick={() => window.print()} className="w-full">
            <Icon name="print" />
            {r.print}
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <section
          aria-labelledby="next-title"
          className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
        >
          <h2 id="next-title" className="text-xl">
            {r.nextTitle}
          </h2>
          <ol className="mt-4 flex flex-col gap-3">
            {r.next.map((line, index) => (
              <li key={line} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-medium text-brand-strong">
                  {index + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="flex flex-wrap items-center gap-x-1">
          <ProofButton
            issueId={receipt.issueId}
            recordId={receipt.issueId}
            label={r.proofLabel}
            ledger={receipt.ledger}
            withDocument
            reportId={receipt.issueId}
            className="-ml-3"
          />
        </div>

        {receipt.evidence.length > 0 ? (
          <details className="rounded-2xl border border-line bg-surface px-5 py-1 shadow-card">
            <summary className="flex min-h-12 cursor-pointer items-center font-medium">
              {r.evidenceTitle} ({receipt.evidence.length})
            </summary>
            <div className="pb-4">
              <EvidenceList issueId={receipt.issueId} items={receipt.evidence} />
              <p className="mt-3 text-sm text-muted">{r.keepFiles}</p>
            </div>
          </details>
        ) : (
          <p className="text-sm text-muted">{r.evidenceNone}</p>
        )}

        <p className="flex items-start gap-2 text-sm font-medium">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" />
          {m.report.review.danger}
        </p>
      </div>
    </PageShell>
  );
}
