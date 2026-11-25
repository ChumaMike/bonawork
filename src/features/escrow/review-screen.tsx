"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import {
  Container,
  Notice,
  PageError,
  PageHero,
  PageLoading,
} from "@/components/ui/page";
import { getApi } from "@/data/api";
import { useAudience } from "@/data/audience";
import { useQuery } from "@/data/use-query";
import type { CopilotInvoiceLine, ReviewRecord } from "@/features/agent/contracts";
import { ReviewerCopilot } from "@/features/agent/reviewer-copilot";
import {
  EscrowApiError,
  escrowApi,
  type EscrowTranche,
  type PreparedVerify,
  type VerifySent,
} from "./api";
import { SandboxBadge } from "./escrow-screen";

function GuardianResult({ prepared }: { prepared: PreparedVerify }) {
  const { ok, findings } = prepared.guardian;
  return (
    <Card className="flex flex-col gap-3" data-testid="guardian-result" data-ok={ok}>
      <h2 className="text-lg">Bona Guardian check</h2>
      <Notice
        tone={ok ? "success" : "danger"}
        icon={ok ? "shieldCheck" : "alert"}
        title={ok ? "Nothing wrong found" : "Do not sign this"}
      >
        <p>
          Bona Guardian is a set of fixed rules. It reads the transaction before you sign.
          It does not approve anything: you do.
        </p>
      </Notice>
      {findings.length > 0 ? (
        <ul className="flex flex-col gap-1.5" data-testid="guardian-findings">
          {findings.map((f, i) => (
            <li key={`${f.code}-${i}`} className="flex items-start gap-2 text-[0.95rem]">
              <Icon
                name={f.severity === "error" ? "x" : "alert"}
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                <span className="font-semibold">
                  {f.severity === "error" ? "Error" : "Warning"}:
                </span>{" "}
                {f.message}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <h3 className="font-semibold">What this transaction does</h3>
      <ol
        className="flex list-decimal flex-col gap-1.5 pl-5"
        data-testid="guardian-description"
      >
        {prepared.description.map((line, i) => (
          <li key={i} className="text-[0.95rem]">
            {line}
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Why a finished checklist cannot be signed yet; null when it can. */
function reviewBlocker(review: ReviewRecord | null): string | null {
  if (!review) return "Finish the checklist first.";
  const open = review.items.filter((i) => i.result === "not_checked").length;
  if (open > 0) return `${open} checks are still marked not checked.`;
  if (review.items.some((i) => i.result === "fail")) {
    return "A check failed, so this cannot be verified. Raise it with the school and the contractor.";
  }
  return null;
}

/** The reviewer's verify screen: `/issues/:id/escrow/review?stage=0|1`. */
export function EscrowReviewScreen() {
  const { issueId } = useParams<{ issueId: string }>();
  const search = useSearchParams();
  const audience = useAudience();
  const escrow = useQuery(`escrow:${issueId}`, () => escrowApi.get(issueId));
  const issue = useQuery(`issue:${issueId}`, () => getApi().getIssue(issueId));
  const isReviewer =
    audience.status === "ready" && audience.role === "independent_reviewer";
  const trail = useQuery(`trail:${issueId}:${isReviewer}`, () =>
    isReviewer
      ? getApi()
          .getMoneyTrail(issueId)
          .catch(() => null)
      : Promise.resolve(null),
  );
  const [review, setReview] = useState<ReviewRecord | null>(null);
  const [prepared, setPrepared] = useState<PreparedVerify | null>(null);
  const [sent, setSent] = useState<VerifySent | null>(null);
  const [busy, setBusy] = useState<"prepare" | "sign" | null>(null);
  const [error, setError] = useState<EscrowApiError | null>(null);

  if (escrow.error) return <PageError onRetry={escrow.reload} />;
  if (escrow.data === undefined || audience.status === "loading") return <PageLoading />;

  const back = { href: `/issues/${issueId}/escrow`, label: "Escrow" };
  const asked = search.get("stage") === "1" ? 1 : search.get("stage") === "0" ? 0 : null;
  const claimed: EscrowTranche | undefined = escrow.data?.tranches?.find(
    (t) => t.state === "Claimed" && (asked === null || t.index === asked),
  );
  const invoice = trail.data?.invoices.at(-1);
  const lines: CopilotInvoiceLine[] = (invoice?.lines ?? [])
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      lineId: l.sku,
      description: l.description,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents ?? 0,
    }));
  const blocker = reviewBlocker(review);

  async function prepare() {
    if (!claimed || !review || blocker) return;
    setBusy("prepare");
    setError(null);
    setPrepared(null);
    try {
      setPrepared(
        await escrowApi.prepareVerify(issueId, { index: claimed.index, review }),
      );
    } catch (e) {
      setError(e as EscrowApiError);
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!claimed || !prepared || !review) return;
    setBusy("sign");
    setError(null);
    try {
      setSent(
        await escrowApi.submitVerify(issueId, {
          index: claimed.index,
          transaction: prepared.transaction,
          review,
        }),
      );
    } catch (e) {
      setError(e as EscrowApiError);
    } finally {
      setBusy(null);
    }
  }

  let body;
  if (!isReviewer) {
    body = (
      <Notice icon="lock" title="Reviewers only">
        <p>Sign in as the independent reviewer to verify a claim.</p>
      </Notice>
    );
  } else if (sent) {
    body = (
      <Notice tone="success" icon="shieldCheck" title="Verified on Solana devnet">
        <p>
          The challenge window has started. After it ends, anyone can release this part.
        </p>
        {sent.caseStatus.changed ? (
          <p className="mt-2" data-testid="case-status-sync">
            The case is now marked verified.
          </p>
        ) : claimed?.index === 1 ? (
          <p className="mt-2 text-sm" data-testid="case-status-sync">
            The case status was not changed: {sent.caseStatus.reason}
          </p>
        ) : null}
        <p className="mt-2">
          <a
            href={sent.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            See the transaction on Solana Explorer
          </a>
        </p>
        <ButtonLink href={back.href} variant="secondary" size="sm" className="mt-3">
          Back to the escrow
        </ButtonLink>
      </Notice>
    );
  } else if (!claimed) {
    body = (
      <Notice icon="info" title="Nothing to review">
        <p>There is no claim waiting for a check.</p>
      </Notice>
    );
  } else if (!issue.data || trail.data === undefined) {
    body = <PageLoading />;
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-1">
          <p className="text-lg font-medium">
            {claimed.label} · <span className="font-mono">{claimed.amountLabel}</span>
          </p>
          <p className="text-sm text-muted">{claimed.detail}</p>
        </Card>

        <ReviewerCopilot
          caseRef={issue.data.reference}
          caseOpenedAt={issue.data.createdAt}
          request={{
            milestone: claimed.detail,
            stage: claimed.index === 0 ? "materials" : "completion",
            lines,
            priceFlags: [],
          }}
          onFinish={(finished) => {
            setReview(finished.record);
            setPrepared(null);
          }}
        />

        <div className="flex flex-col gap-2">
          <Button
            onClick={prepare}
            variant={prepared ? "secondary" : "primary"}
            loading={busy === "prepare"}
            disabled={blocker !== null}
          >
            Check the transaction
          </Button>
          {blocker ? (
            <p className="text-sm text-muted" data-testid="review-blocker">
              {blocker}
            </p>
          ) : (
            <p className="text-sm text-muted">
              The checklist&apos;s fingerprint is written into the escrow. The checklist
              stays off-chain.
            </p>
          )}
        </div>

        {prepared ? (
          <>
            <GuardianResult prepared={prepared} />
            <Card className="flex flex-col gap-3">
              <p className="font-semibold" data-testid="signer-label">
                Signing with: {prepared.signer.label}
              </p>
              <p className="text-sm text-muted">
                This is a key held by the server for the devnet demo. It is not your own
                wallet.
              </p>
              <Button
                onClick={sign}
                loading={busy === "sign"}
                disabled={!prepared.guardian.ok || blocker !== null}
              >
                Sign and verify {claimed.index === 0 ? "Check 1" : "Check 2"}
              </Button>
            </Card>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <PageHero
        back={back}
        eyebrow="Independent review"
        title="Verify a check"
        intro="Work through the checklist, read what the transaction does, then sign. Only you can verify."
      />
      <Container size="narrow" className="flex flex-col gap-5">
        <SandboxBadge />
        {body}
        {error ? (
          <Notice tone="danger" icon="alert" title="Not sent">
            <p>{error.message}</p>
            {error.programError ? (
              <p className="font-mono text-xs">Program: {error.programError}</p>
            ) : null}
          </Notice>
        ) : null}
      </Container>
    </>
  );
}
