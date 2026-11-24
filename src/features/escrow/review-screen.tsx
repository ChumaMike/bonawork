"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import {
  Container,
  Notice,
  PageError,
  PageHero,
  PageLoading,
} from "@/components/ui/page";
import { useAudience } from "@/data/audience";
import { useQuery } from "@/data/use-query";
import {
  EscrowApiError,
  escrowApi,
  type EscrowTranche,
  type PreparedVerify,
  type SentStep,
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

/** The reviewer's verify screen: `/issues/:id/escrow/review?stage=0|1`. */
export function EscrowReviewScreen() {
  const { issueId } = useParams<{ issueId: string }>();
  const search = useSearchParams();
  const audience = useAudience();
  const escrow = useQuery(`escrow:${issueId}`, () => escrowApi.get(issueId));
  const [note, setNote] = useState("");
  const [prepared, setPrepared] = useState<PreparedVerify | null>(null);
  const [sent, setSent] = useState<SentStep | null>(null);
  const [busy, setBusy] = useState<"prepare" | "sign" | null>(null);
  const [error, setError] = useState<EscrowApiError | null>(null);

  if (escrow.error) return <PageError onRetry={escrow.reload} />;
  if (escrow.data === undefined || audience.status === "loading") return <PageLoading />;

  const back = { href: `/issues/${issueId}/escrow`, label: "Escrow" };
  const isReviewer =
    audience.status === "ready" && audience.role === "independent_reviewer";
  const asked = search.get("stage") === "1" ? 1 : search.get("stage") === "0" ? 0 : null;
  const claimed: EscrowTranche | undefined = escrow.data?.tranches?.find(
    (t) => t.state === "Claimed" && (asked === null || t.index === asked),
  );

  async function prepare(event: FormEvent) {
    event.preventDefault();
    if (!claimed) return;
    setBusy("prepare");
    setError(null);
    setPrepared(null);
    try {
      setPrepared(await escrowApi.prepareVerify(issueId, { index: claimed.index, note }));
    } catch (e) {
      setError(e as EscrowApiError);
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!claimed || !prepared) return;
    setBusy("sign");
    setError(null);
    try {
      setSent(
        await escrowApi.submitVerify(issueId, {
          index: claimed.index,
          transaction: prepared.transaction,
          reviewHash: prepared.reviewHash,
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
          The challenge window has started. After it ends, anyone can release this stage.
        </p>
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
        <p>There is no claimed stage waiting for review.</p>
      </Notice>
    );
  } else {
    body = (
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-1">
          <p className="text-sm text-muted">Stage {claimed.index + 1}</p>
          <p className="text-lg font-medium">
            {claimed.label} · <span className="font-mono">{claimed.amountLabel}</span>
          </p>
        </Card>
        <form onSubmit={prepare} className="flex flex-col gap-3">
          <Field
            id="review-note"
            label="What did you check?"
            hint="Its fingerprint is written into the escrow. The text stays off-chain."
          >
            <Textarea
              id="review-note"
              rows={3}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setPrepared(null);
              }}
              required
            />
          </Field>
          <Button
            type="submit"
            variant={prepared ? "secondary" : "primary"}
            loading={busy === "prepare"}
            disabled={!note.trim()}
          >
            Check the transaction
          </Button>
        </form>

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
                disabled={!prepared.guardian.ok}
              >
                Sign and verify this stage
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
        title="Verify a claimed stage"
        intro="Read what the transaction does, then sign it. Only you can verify."
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
