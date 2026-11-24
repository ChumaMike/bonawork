"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { fingerprint } from "@/components/file-picker";
import { LedgerChip } from "@/components/ledger-state";
import { ProofButton } from "@/components/proof/proof-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { CopyButton } from "@/components/ui/copy-button";
import { Icon, type IconName } from "@/components/ui/icon";
import { Notice, PageShell } from "@/components/ui/page";
import { getApi } from "@/data/api";
import type { DigestMatch, LedgerRecord } from "@/data/types";
import { useMessages } from "@/i18n";
import { type Hex32, SOLANA_CHAINS } from "@/shared";

/** The separate verifier. It reads Solana itself and never calls this app. */
const VERIFY_URL = process.env.NEXT_PUBLIC_VERIFY_URL || "https://bona-verify.vercel.app";

/** Solana devnet. Anything else is a sample. */
const PUBLIC_CHAINS = new Set<string>(Object.values(SOLANA_CHAINS));

function isSampleRecord(record: LedgerRecord): boolean {
  return record.source !== "ledger" || !PUBLIC_CHAINS.has(record.receipt.chainId);
}

interface Result {
  name: string;
  size: number;
  digest: Hex32;
  matches: DigestMatch[];
}

type Phase = "idle" | "hashing" | "looking";

type StepState = "done" | "none" | "skipped" | "waiting";

const STEP_ICON: Record<StepState, IconName> = {
  done: "check",
  none: "x",
  skipped: "arrowRight",
  waiting: "clock",
};

function Step({
  number,
  title,
  state,
  children,
}: {
  number: number;
  title: string;
  state: StepState;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full font-medium",
          state === "done" && "bg-st-verified-soft text-st-verified",
          state === "none" && "bg-accent-soft text-accent",
          state === "skipped" && "bg-sunken text-muted",
          state === "waiting" && "bg-st-assess-soft text-st-assess",
        )}
      >
        {state === "waiting" ? (
          number
        ) : (
          <Icon name={STEP_ICON[state]} className="size-4" />
        )}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="font-medium">
          <span className="sr-only">{number}. </span>
          {title}
        </p>
        {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
      </div>
    </li>
  );
}

/**
 * Check a file against BonaWork's records. The fingerprint is computed in
 * the browser; only the fingerprint is looked up. Three short steps show what
 * was checked, then one plain answer. The codes sit behind "Show proof".
 */
export function VerifyScreen() {
  const m = useMessages();
  const v = m.verify;
  const inputId = useId();
  const [phase, setPhase] = useState<Phase>("idle");
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function check(file: File | undefined) {
    if (!file) return;
    setPhase("hashing");
    setFailed(false);
    setResult(null);
    try {
      // The fingerprint is computed here, in the browser. Only the fingerprint is looked up.
      const { digest } = await fingerprint(file);
      setPhase("looking");
      const matches = await getApi().findEvidenceByDigest(digest);
      setResult({ name: file.name, size: file.size, digest, matches });
    } catch {
      setFailed(true);
    } finally {
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const matched = result !== null && result.matches.length > 0;
  const sample =
    matched && result.matches.some((hit) => isSampleRecord(hit.evidence.ledger));

  return (
    <PageShell
      eyebrow={m.shell.eyebrow.verify}
      title={v.title}
      intro={v.intro}
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start"
    >
      <div className="flex min-w-0 flex-col gap-6">
        {result === null ? (
          <div className="flex flex-col gap-4">
            <label
              htmlFor={inputId}
              className="flex min-h-56 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-line bg-surface p-6 text-center shadow-card transition-[border-color,box-shadow] focus-within:border-brand focus-within:shadow-[0_0_0_4px_rgb(3_70_255/0.12)] hover:border-brand"
            >
              <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <Icon name="upload" className="size-7" />
              </span>
              <span className="font-display text-2xl font-medium tracking-tight">
                {busy ? v.computing : v.choose}
              </span>
              <span className="text-sm text-muted">{v.stays}</span>
              <input
                id={inputId}
                type="file"
                className="sr-only"
                disabled={busy}
                onChange={(event) => void check(event.target.files?.[0])}
              />
            </label>
            {busy ? (
              <ol
                aria-live="polite"
                className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card"
              >
                <Step
                  number={1}
                  title={v.stepFingerprint}
                  state={phase === "hashing" ? "waiting" : "done"}
                />
                <Step
                  number={2}
                  title={v.stepLookup}
                  state={phase === "looking" ? "waiting" : "skipped"}
                />
              </ol>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-5" aria-live="polite">
            <ol className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
              <Step number={1} title={v.stepChose} state="done">
                <span className="break-words">{result.name}</span>
              </Step>
              <Step number={2} title={v.stepFingerprint} state="done">
                {v.stepFingerprintDone}
              </Step>
              <Step number={3} title={v.stepLookup} state={matched ? "done" : "none"}>
                {matched ? v.stepLookupMatch(result.matches.length) : v.stepLookupNone}
              </Step>
            </ol>

            {matched ? (
              <div className="rounded-2xl border border-line bg-surface p-5 text-center shadow-card sm:p-7">
                <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-st-verified text-on-brand">
                  <Icon name="check" className="size-8" />
                </span>
                <p className="mt-3 font-display text-2xl font-medium tracking-tight">
                  {v.matchTitle}
                </p>
                <p className="mt-1" data-testid="verify-result" data-match="true">
                  {v.matchPlain}
                </p>
                <ul className="mt-4 flex flex-col gap-3 text-left">
                  {result.matches.map(({ issue, evidence }) => (
                    <li key={evidence.id} className="rounded-xl bg-sunken p-4">
                      <Link
                        href={`/issues/${issue.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {issue.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-1">
                        <span className="mr-2 text-sm text-muted">
                          {m.issue.evidenceVersion(evidence.version)}
                        </span>
                        <LedgerChip record={evidence.ledger} />
                        <ProofButton
                          issueId={issue.id}
                          recordId={evidence.id}
                          label={m.issue.evidenceVersion(evidence.version)}
                          ledger={evidence.ledger}
                          digest={evidence.digest}
                          reportId={issue.id}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                {sample ? (
                  <p className="mt-3 text-sm text-muted">{v.sampleNote}</p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-surface p-5 text-center shadow-card sm:p-7">
                <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-accent text-on-brand">
                  <Icon name="x" className="size-8" />
                </span>
                <p className="mt-3 font-display text-2xl font-medium tracking-tight">
                  {v.noMatchTitle}
                </p>
                <p className="mt-1" data-testid="verify-result" data-match="false">
                  {v.noMatchPlain}
                </p>
              </div>
            )}

            <details className="rounded-2xl border border-line bg-surface px-5 py-1 shadow-card">
              <summary className="flex min-h-12 cursor-pointer items-center font-medium">
                {v.yourFingerprint}
              </summary>
              <div className="pb-3">
                <p className="text-sm text-muted">{m.ledger.fingerprintHelp}</p>
                <code
                  data-testid="computed-digest"
                  className="font-mono text-sm break-all"
                >
                  {result.digest}
                </code>
                <div>
                  <CopyButton
                    value={result.digest}
                    label={v.yourFingerprint}
                    className="-ml-3"
                  />
                </div>
              </div>
            </details>

            <div className="no-print flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => setResult(null)} className="w-full sm:w-auto">
                {v.again}
              </Button>
              <Button variant="quiet" onClick={() => window.print()}>
                <Icon name="print" className="size-4" />
                {v.print}
              </Button>
            </div>
          </div>
        )}

        {failed ? (
          <Notice tone="danger" icon="alert">
            <p role="alert">{m.common.actionError}</p>
          </Notice>
        ) : null}
      </div>

      <div className="no-print flex flex-col gap-4">
        <Card>
          <h2 className="text-xl">{v.howTitle}</h2>
          <ol className="mt-4 flex flex-col gap-3 text-[0.95rem]">
            {v.how.map((line, index) => (
              <li key={line} className="flex gap-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-medium text-brand-strong">
                  {index + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </Card>
        {/* One tap away: the separate verifier is for someone who already holds a receipt. */}
        <details className="rounded-2xl border border-line bg-surface px-5 py-1 shadow-card">
          <summary className="flex min-h-12 cursor-pointer items-center font-medium">
            {v.receiptTitle}
          </summary>
          <div className="pb-4">
            <p className="text-[0.95rem] text-muted">{v.receiptBody}</p>
            <a
              href={VERIFY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-2 font-medium text-brand-strong underline underline-offset-4"
            >
              <Icon name="shieldCheck" className="size-5" />
              {v.openVerify}
            </a>
          </div>
        </details>
      </div>
    </PageShell>
  );
}
