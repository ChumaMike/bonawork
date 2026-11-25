"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
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
import { solanaAddressUrl } from "@/lib/solana-explorer";
import {
  EscrowApiError,
  escrowApi,
  formatWait,
  randToCents,
  shortKey,
  type EscrowTranche,
  type EscrowTx,
  type PublicEscrow,
} from "./api";

/**
 * Unix seconds on this device, ticking once a second. Only for countdowns:
 * the chain's clock decides when a release is allowed.
 */
function useLocalClock() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

const STATE_TEXT: Record<EscrowTranche["state"], string> = {
  Pending: "Waiting for the contractor to claim",
  Claimed: "Claimed. Waiting for the independent reviewer",
  Verified: "Verified. Challenge window open",
  Disputed: "Disputed",
  Released: "Released to the contractor (sandbox payout)",
  Refunded: "Refunded to the funder",
};

const STEP_TEXT: Record<EscrowTx["step"], string> = {
  create: "Escrow created",
  cash_in: "Sandbox cash-in to the demo funder",
  fund: "Sandbox rand moved into the vault",
  activate: "Escrow marked funded",
  claim: "Contractor claimed",
  verify: "Reviewer verified",
  release: "Released (sandbox payout)",
  refund: "Refunded to the funder",
};

export function SandboxBadge() {
  return (
    <p
      data-testid="sandbox-rand"
      className="inline-flex items-center gap-2 self-start rounded-full border border-line-strong bg-surface px-3 py-1 text-sm font-semibold tracking-wide"
    >
      <Icon name="info" className="size-4" />
      SANDBOX RAND · Solana devnet · no real money
    </p>
  );
}

function ErrorText({ error }: { error: EscrowApiError | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
      <span>
        {error.message}
        {error.programError ? (
          <span className="block font-mono text-xs">Program: {error.programError}</span>
        ) : null}
      </span>
    </p>
  );
}

function TxLink({ url, signature }: { url: string; signature: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-sm text-brand-strong underline underline-offset-2"
    >
      {shortKey(signature)}
      <Icon name="link" className="size-3.5" />
      <span className="sr-only">(opens Solana Explorer)</span>
    </a>
  );
}

// ------------------------------------------------------------------ fund

const WINDOWS = [
  { seconds: 60, label: "60 seconds (demo window)" },
  { seconds: 600, label: "10 minutes" },
  { seconds: 3_600, label: "1 hour" },
  { seconds: 86_400, label: "1 day" },
];

function FundForm({
  issueId,
  onDone,
  existing,
}: {
  issueId: string;
  onDone: (escrow: PublicEscrow) => void;
  existing: PublicEscrow | null;
}) {
  const [materials, setMaterials] = useState("3000");
  const [completion, setCompletion] = useState("2000");
  const [window, setWindow] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EscrowApiError | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const tranches = existing?.tranches;
    const a = tranches ? tranches[0].amount : randToCents(materials);
    const b = tranches ? tranches[1].amount : randToCents(completion);
    if (!a || !b) {
      setError(new EscrowApiError("Enter both amounts in rand, for example 3000.", 422));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(
        await escrowApi.fund(issueId, {
          materials: a,
          completion: b,
          challengeSeconds: existing?.challengeSeconds ?? window,
        }),
      );
    } catch (e) {
      setError(e as EscrowApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="fund-escrow" className="flex flex-col gap-4">
      <h2 className="text-xl">Fund this repair</h2>
      <SandboxBadge />
      <p className="text-[0.95rem] text-muted">
        The money waits in an escrow on Solana devnet. The independent reviewer makes two
        checks. Each check releases its part: materials are paid on verified delivery, the
        rest when the work is done.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {existing ? (
          <p className="text-sm">
            The escrow exists but is not funded yet. Total {existing.totalLabel}.
          </p>
        ) : (
          <>
            <Field id="fund-materials" label="Check 1: Materials on site (sandbox rand)">
              <Input
                id="fund-materials"
                inputMode="decimal"
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                required
              />
            </Field>
            <Field id="fund-completion" label="Check 2: Work done (sandbox rand)">
              <Input
                id="fund-completion"
                inputMode="decimal"
                value={completion}
                onChange={(e) => setCompletion(e.target.value)}
                required
              />
            </Field>
            <Field
              id="fund-window"
              label="Challenge window"
              hint="Time after a review in which a release can still be stopped."
            >
              <Select
                id="fund-window"
                value={window}
                onChange={(e) => setWindow(Number(e.target.value))}
              >
                {WINDOWS.map((w) => (
                  <option key={w.seconds} value={w.seconds}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        <ErrorText error={error} />
        <Button type="submit" loading={busy} className="w-full">
          {existing ? "Finish funding" : "Fund with sandbox rand"}
        </Button>
        <p className="text-sm text-muted">
          A demo funder key (devnet) signs the transfer. This takes up to a minute.
        </p>
      </form>
    </Card>
  );
}

// ------------------------------------------------------------------ claim

function ClaimForm({
  issueId,
  tranche,
  onDone,
}: {
  issueId: string;
  tranche: EscrowTranche;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EscrowApiError | null>(null);
  const id = `claim-note-${tranche.index}`;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await escrowApi.claim(issueId, { index: tranche.index, note });
      onDone();
    } catch (e) {
      setError(e as EscrowApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="claim-form">
      <Field
        id={id}
        label={
          tranche.index === 0
            ? "What was delivered? List it as on the invoice."
            : "What was installed, and is it working?"
        }
      >
        <Textarea
          id={id}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          required
        />
      </Field>
      <ErrorText error={error} />
      <Button type="submit" loading={busy} disabled={!note.trim()}>
        Ask for {tranche.index === 0 ? "Check 1" : "Check 2"}
      </Button>
      <p className="text-sm text-muted">Signed with the demo contractor key (devnet).</p>
    </form>
  );
}

// ---------------------------------------------------------------- tranche

function TrancheCard({
  issueId,
  tranche,
  escrow,
  now,
  role,
  onChanged,
}: {
  issueId: string;
  tranche: EscrowTranche;
  escrow: PublicEscrow;
  now: number;
  role: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<"release" | "refund" | null>(null);
  const [error, setError] = useState<EscrowApiError | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const challengeLeft = Number(tranche.challengeUntil) - now;
  const expired =
    (tranche.state === "Pending" || tranche.state === "Claimed") &&
    now >= Number(tranche.verificationDeadline);

  async function act(kind: "release" | "refund") {
    setBusy(kind);
    setError(null);
    try {
      const step =
        kind === "release"
          ? await escrowApi.release(issueId, tranche.index)
          : await escrowApi.refund(issueId, tranche.index);
      setSent(step.explorerUrl);
      onChanged();
    } catch (e) {
      setError(e as EscrowApiError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card
      className="flex flex-col gap-3"
      data-testid={`tranche-${tranche.index}`}
      data-state={tranche.state}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg">{tranche.label}</h3>
        <p className="font-mono text-lg font-medium">{tranche.amountLabel}</p>
      </div>
      <p className="font-medium" data-testid={`tranche-${tranche.index}-state`}>
        {STATE_TEXT[tranche.state]}
      </p>
      <p className="text-sm text-muted">{tranche.detail}</p>
      <p className="text-sm" data-testid={`tranche-${tranche.index}-payee`}>
        Paid to: {tranche.payee.role}
        {tranche.payee.demo ? " (demo key, devnet)" : ""}{" "}
        <a
          href={solanaAddressUrl(tranche.payee.address)}
          target="_blank"
          rel="noreferrer"
          className="font-mono underline"
        >
          {shortKey(tranche.payee.address)}
        </a>
      </p>

      {tranche.state === "Verified" ? (
        <div className="flex flex-col gap-2">
          <p
            data-testid={`tranche-${tranche.index}-countdown`}
            className="text-[0.95rem]"
          >
            {challengeLeft > 0
              ? `Challenge window ends in about ${formatWait(challengeLeft)}. The chain decides the exact moment.`
              : "The challenge window has ended. Anyone can release this part now."}
          </p>
          <Button
            onClick={() => act("release")}
            loading={busy === "release"}
            variant={challengeLeft > 0 ? "secondary" : "primary"}
          >
            Release now
          </Button>
        </div>
      ) : null}

      {tranche.state === "Pending" && role === "supplier" && escrow.funded ? (
        <ClaimForm issueId={issueId} tranche={tranche} onDone={onChanged} />
      ) : null}

      {tranche.state === "Claimed" && role === "independent_reviewer" ? (
        <ButtonLink href={`/issues/${issueId}/escrow/review?stage=${tranche.index}`}>
          Review this claim
          <Icon name="arrowRight" className="size-5" />
        </ButtonLink>
      ) : null}

      {expired ? (
        <Button
          variant="secondary"
          onClick={() => act("refund")}
          loading={busy === "refund"}
        >
          Refund to the funder
        </Button>
      ) : null}

      <ErrorText error={error} />
      {sent ? (
        <p className="text-sm">
          Sent.{" "}
          <a href={sent} target="_blank" rel="noreferrer" className="underline">
            See it on Solana Explorer
          </a>
        </p>
      ) : null}
    </Card>
  );
}

// ----------------------------------------------------------------- screen

export function EscrowView({
  issueId,
  escrow,
  role,
  reload,
  setEscrow,
}: {
  issueId: string;
  escrow: PublicEscrow | null;
  role: string | null;
  reload: () => void;
  setEscrow: (e: PublicEscrow) => void;
}) {
  const now = useLocalClock();

  if (!escrow) {
    return role === "buyer" ? (
      <FundForm issueId={issueId} onDone={setEscrow} existing={null} />
    ) : (
      <Notice icon="info" title="No escrow yet">
        <p>No one has funded this repair yet.</p>
        {role === null ? (
          <p className="mt-1 text-sm text-muted">
            Funders{" "}
            <Link href={`/sign-in?next=/issues/${issueId}/escrow`} className="underline">
              sign in
            </Link>{" "}
            to fund it.
          </p>
        ) : null}
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SandboxBadge />
      {escrow.chainError ? (
        <Notice tone="warning" icon="alert" title="Could not read the chain">
          <p>{escrow.chainError}</p>
        </Notice>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
        <div>
          <dt className="text-sm text-muted">Total</dt>
          <dd className="font-mono font-medium">{escrow.totalLabel}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">In the vault now</dt>
          <dd className="font-mono font-medium">{escrow.vault.label ?? "unknown"}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Funded</dt>
          <dd className="font-medium" data-testid="escrow-funded">
            {escrow.funded === null ? "unknown" : escrow.funded ? "Yes" : "Not yet"}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Challenge window</dt>
          <dd className="font-medium">{formatWait(escrow.challengeSeconds)}</dd>
        </div>
      </dl>

      {escrow.funded === false && role === "buyer" ? (
        <FundForm issueId={issueId} onDone={setEscrow} existing={escrow} />
      ) : null}

      {escrow.tranches?.map((t) => (
        <TrancheCard
          key={t.index}
          issueId={issueId}
          tranche={t}
          escrow={escrow}
          now={now}
          role={role}
          onChanged={reload}
        />
      ))}

      <Button variant="quiet" onClick={reload} className="self-start">
        <Icon name="clock" className="size-4" />
        Read the chain again
      </Button>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg">Transactions</h2>
        {escrow.transactions.length === 0 ? (
          <p className="text-muted">None yet.</p>
        ) : (
          <ol
            className="flex flex-col divide-y divide-line"
            data-testid="escrow-transactions"
          >
            {escrow.transactions.map((t) => (
              <li
                key={t.signature}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
              >
                <span>
                  {STEP_TEXT[t.step]}
                  {t.index !== undefined ? ` (Check ${t.index + 1})` : ""}
                </span>
                <TxLink url={t.url} signature={t.signature} />
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card className="flex flex-col gap-2 text-sm">
        <h2 className="text-lg">On Solana devnet</h2>
        <p>
          Escrow{" "}
          <a
            href={escrow.escrow.url}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline"
          >
            {shortKey(escrow.escrow.address)}
          </a>{" "}
          · Vault{" "}
          <a
            href={escrow.vault.url}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline"
          >
            {shortKey(escrow.vault.address)}
          </a>{" "}
          · Program{" "}
          <a
            href={solanaAddressUrl(escrow.programId)}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline"
          >
            {shortKey(escrow.programId)}
          </a>
        </p>
        <p className="text-muted">
          Funder:{" "}
          {escrow.funder.kind === "demo" ? "demo funder key" : "funder's own wallet"} ·
          Contractor: demo contractor key · Reviewer:{" "}
          {escrow.reviewer.demo
            ? "Demo reviewer key (devnet)"
            : shortKey(escrow.reviewer.address)}
        </p>
      </Card>
    </div>
  );
}

/** The public escrow page of a case: `/issues/:id/escrow`. */
export function EscrowScreen() {
  const { issueId } = useParams<{ issueId: string }>();
  const audience = useAudience();
  const role = audience.status === "ready" ? audience.role : null;
  const issue = useQuery(`issue:${issueId}`, () => getApi().getIssue(issueId));
  const escrow = useQuery(`escrow:${issueId}`, () => escrowApi.get(issueId));

  if (escrow.error) return <PageError onRetry={escrow.reload} />;
  if (escrow.data === undefined) return <PageLoading />;

  return (
    <>
      <PageHero
        back={{
          href: `/issues/${issueId}`,
          label: issue.data?.title ?? "Back to the case",
        }}
        eyebrow="Escrow on Solana devnet"
        title="Repair money"
        intro="Sandbox rand held for this repair. The reviewer makes two checks; each one releases its part."
      />
      <Container size="narrow">
        <EscrowView
          issueId={issueId}
          escrow={escrow.data}
          role={role}
          reload={escrow.reload}
          setEscrow={escrow.setData}
        />
      </Container>
    </>
  );
}
