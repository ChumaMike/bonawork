"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
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
import { PollarFund, type PollarFunded } from "@/features/agent/pollar-fund";
import { RepairScout, type ConfirmedBudget } from "@/features/agent/repair-scout";
import { ReadAloud } from "@/features/agent/voice";
import { WhereMoney } from "@/features/agent/where-money";
import {
  EscrowApiError,
  escrowApi,
  formatCents,
  formatWait,
  randToCents,
  shortKey,
  type FundTerms,
  type RepairBudget,
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
  Released: "Released to the payee (sandbox payout)",
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
  sweep: "Extra money returned to the funder",
  reassign_reviewer: "Reviewer replaced (admin and school)",
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

/** Pollar is offered only when its publishable key is set (inlined at build time). */
const POLLAR_ENABLED = Boolean(process.env.NEXT_PUBLIC_POLLAR_API_KEY);

const centsToRand = (cents: number) => (cents / 100).toFixed(2);

type FundMethod = "pollar" | "demo";

function FundForm({
  issueId,
  onDone,
  existing,
  budget,
}: {
  issueId: string;
  onDone: (escrow: PublicEscrow) => void;
  existing: PublicEscrow | null;
  /** The school's confirmed Repair Scout budget, used to prefill the amounts. */
  budget: RepairBudget | null;
}) {
  const [materials, setMaterials] = useState(
    budget ? centsToRand(budget.materialsCents) : "3000",
  );
  const [completion, setCompletion] = useState(
    budget ? centsToRand(budget.completionCents) : "2000",
  );
  const [window, setWindow] = useState(60);
  const [materialsPayee, setMaterialsPayee] = useState<"contractor" | "demo_supplier">(
    "demo_supplier",
  );
  // An unfunded escrow keeps the funding route it was made with.
  const [method, setMethod] = useState<FundMethod>(
    existing
      ? existing.funder.kind === "wallet"
        ? "pollar"
        : "demo"
      : POLLAR_ENABLED
        ? "pollar"
        : "demo",
  );
  /** Pollar: the escrow made for the funder's wallet, once known. */
  const [walletEscrow, setWalletEscrow] = useState<string | null>(
    existing?.funder.kind === "wallet" ? existing.escrow.address : null,
  );
  const [pollarStarted, setPollarStarted] = useState(Boolean(walletEscrow));
  const preparedFor = useRef<string | null>(
    existing?.funder.kind === "wallet" ? existing.funder.address : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EscrowApiError | null>(null);

  function terms(): FundTerms | null {
    const tranches = existing?.tranches;
    const a = tranches ? tranches[0].amount : randToCents(materials);
    const b = tranches ? tranches[1].amount : randToCents(completion);
    if (!a || !b) {
      setError(new EscrowApiError("Enter both amounts in rand, for example 3000.", 422));
      return null;
    }
    return {
      materials: a,
      completion: b,
      challengeSeconds: existing?.challengeSeconds ?? window,
      materialsPayee,
    };
  }

  async function submitDemo(event: FormEvent) {
    event.preventDefault();
    const t = terms();
    if (!t) return;
    setBusy(true);
    setError(null);
    try {
      onDone(await escrowApi.fund(issueId, t));
    } catch (e) {
      setError(e as EscrowApiError);
    } finally {
      setBusy(false);
    }
  }

  function startPollar(event: FormEvent) {
    event.preventDefault();
    if (!terms()) return;
    setError(null);
    setPollarStarted(true);
  }

  /** Pollar knows the funder's wallet: make the escrow with it as funder. */
  async function onWallet(wallet: string) {
    if (preparedFor.current === wallet) return;
    if (existing?.funder.kind === "wallet" && existing.funder.address !== wallet) {
      setError(
        new EscrowApiError(
          "This escrow was made for another wallet. Sign in with that one.",
          409,
        ),
      );
      return;
    }
    const t = terms();
    if (!t) return;
    preparedFor.current = wallet;
    setError(null);
    try {
      const plan = await escrowApi.prepareWalletFunding(issueId, {
        ...t,
        funderWallet: wallet,
      });
      setWalletEscrow(plan.escrow);
    } catch (e) {
      preparedFor.current = null;
      setError(e as EscrowApiError);
    }
  }

  /** The server checked the transfer; now it checks again and activates. */
  async function onFunded(funded: PollarFunded) {
    setBusy(true);
    setError(null);
    try {
      onDone(await escrowApi.confirmWalletFunding(issueId, funded.signature));
    } catch (e) {
      setError(e as EscrowApiError);
    } finally {
      setBusy(false);
    }
  }

  const amountCents = (() => {
    if (existing) return Number(existing.total);
    const a = randToCents(materials);
    const b = randToCents(completion);
    return a && b ? Number(a) + Number(b) : 0;
  })();

  return (
    <Card data-testid="fund-escrow" className="flex flex-col gap-4">
      <h2 className="text-xl">Fund this repair</h2>
      <SandboxBadge />
      <p className="text-[0.95rem] text-muted">
        The money waits in an escrow on Solana devnet. The independent reviewer makes two
        checks. Each check releases its part: materials are paid on verified delivery, the
        rest when the work is done.
      </p>
      <form
        onSubmit={method === "pollar" ? startPollar : submitDemo}
        className="flex flex-col gap-4"
      >
        {existing ? (
          <p className="text-sm">
            The escrow exists but is not funded yet. Total {existing.totalLabel}.
          </p>
        ) : (
          <>
            {budget ? (
              <p className="text-sm" data-testid="fund-from-budget">
                Amounts from the school&apos;s confirmed budget (
                {formatCents(budget.totalCents)}, split 40/60). You can change them.
              </p>
            ) : null}
            <Field id="fund-materials" label="Check 1: Materials on site (sandbox rand)">
              <Input
                id="fund-materials"
                inputMode="decimal"
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                disabled={pollarStarted}
                required
              />
            </Field>
            <Field
              id="fund-materials-payee"
              label="Check 1 is released to"
              hint="Set when the escrow is made. The program checks every release against it."
            >
              <Select
                id="fund-materials-payee"
                value={materialsPayee}
                disabled={pollarStarted}
                onChange={(e) =>
                  setMaterialsPayee(e.target.value as "contractor" | "demo_supplier")
                }
              >
                <option value="demo_supplier">The supplier (demo key, devnet)</option>
                <option value="contractor">The contractor</option>
              </Select>
            </Field>
            <Field id="fund-completion" label="Check 2: Work done (sandbox rand)">
              <Input
                id="fund-completion"
                inputMode="decimal"
                value={completion}
                onChange={(e) => setCompletion(e.target.value)}
                disabled={pollarStarted}
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
                disabled={pollarStarted}
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

        {!existing && POLLAR_ENABLED ? (
          <Field id="fund-method" label="Pay with">
            <Select
              id="fund-method"
              value={method}
              disabled={pollarStarted}
              onChange={(e) => setMethod(e.target.value as FundMethod)}
            >
              <option value="pollar">Pollar (your email, a devnet wallet)</option>
              <option value="demo">Demo funder (devnet)</option>
            </Select>
          </Field>
        ) : null}

        <ErrorText error={error} />

        {method === "demo" ? (
          <>
            <Button type="submit" loading={busy} className="w-full">
              {existing ? "Finish funding" : "Fund with sandbox rand"}
            </Button>
            <p className="text-sm text-muted">
              Demo funder (devnet): a key held by the server signs the transfer. This
              takes up to a minute.
            </p>
          </>
        ) : !pollarStarted ? (
          <Button type="submit" className="w-full">
            Pay with Pollar
          </Button>
        ) : null}
      </form>

      {method === "pollar" && pollarStarted ? (
        <div className="flex flex-col gap-2" data-testid="pollar-fund">
          <PollarFund
            escrow={walletEscrow}
            amountCents={amountCents}
            onWallet={onWallet}
            onFunded={onFunded}
          />
          {busy ? (
            <p className="text-sm">Checking the transfer and activating the escrow…</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------- school budget

/**
 * The school confirms what the repair needs with Repair Scout. The confirmed
 * budget prefills the funder's amounts; it does not create or fund anything.
 */
function SchoolBudget({
  issueId,
  issueText,
  budget,
  onSaved,
}: {
  issueId: string;
  issueText: string;
  budget: RepairBudget | null;
  onSaved: () => void;
}) {
  const [error, setError] = useState<EscrowApiError | null>(null);
  const [saved, setSaved] = useState(false);

  async function confirm(confirmed: ConfirmedBudget) {
    setError(null);
    setSaved(false);
    if (confirmed.budget.unpriced > 0) {
      setError(new EscrowApiError("Give every part a price before you confirm.", 422));
      return;
    }
    try {
      await escrowApi.confirmBudget(issueId, {
        lines: confirmed.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          kind: l.kind,
          unitPriceCents: l.unitPriceCents ?? 0,
        })),
      });
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e as EscrowApiError);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="school-budget">
      {budget ? (
        <Notice icon="info" title="Budget confirmed">
          <p>
            {formatCents(budget.totalCents)}: Check 1 {formatCents(budget.materialsCents)}
            , Check 2 {formatCents(budget.completionCents)}. The funder sees these
            amounts.
          </p>
        </Notice>
      ) : null}
      <RepairScout initialReport={issueText} demo onConfirm={confirm} />
      <ErrorText error={error} />
      {saved ? (
        <p className="text-sm">Saved. The funder&apos;s form now uses this budget.</p>
      ) : null}
    </div>
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

// ------------------------------------------------------------------ sweep

/** Shown when the vault holds more than the open checks are owed. */
function SweepCard({
  issueId,
  escrow,
  onDone,
}: {
  issueId: string;
  escrow: PublicEscrow;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<EscrowApiError | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function sweep() {
    setBusy(true);
    setError(null);
    try {
      const result = await escrowApi.sweep(issueId);
      setSent(result.sent?.explorerUrl ?? null);
      onDone();
    } catch (e) {
      setError(e as EscrowApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="escrow-surplus">
      <p>
        The vault holds {escrow.surplusLabel} more than the checks still need. Anyone can
        send it back. The program only returns it to the funder.
      </p>
      <Button variant="secondary" onClick={sweep} loading={busy}>
        Return extra money to funder
      </Button>
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

/** One plain paragraph for read-aloud: where the money is, check by check. */
function spokenSummary(escrow: PublicEscrow): string {
  const parts = [
    `This repair has ${escrow.totalLabel} of sandbox rand in escrow on Solana devnet.`,
    `The vault holds ${escrow.vault.label ?? "an unknown amount"} now.`,
  ];
  for (const t of escrow.tranches ?? []) {
    parts.push(
      `${t.label}, ${t.amountLabel}: ${STATE_TEXT[t.state]}. It goes to the ${t.payee.role}.`,
    );
  }
  return parts.join(" ");
}

export function EscrowView({
  issueId,
  escrow,
  role,
  reload,
  setEscrow,
  budget = null,
  reloadBudget = () => {},
  issueText = "",
}: {
  issueId: string;
  escrow: PublicEscrow | null;
  role: string | null;
  reload: () => void;
  setEscrow: (e: PublicEscrow) => void;
  /** The school's confirmed Repair Scout budget, if any. */
  budget?: RepairBudget | null;
  reloadBudget?: () => void;
  /** The case's own words, the starting point for Repair Scout. */
  issueText?: string;
}) {
  const now = useLocalClock();

  if (!escrow) {
    if (role === "buyer") {
      return (
        <FundForm
          key={budget?.confirmedAt ?? "no-budget"}
          issueId={issueId}
          onDone={setEscrow}
          existing={null}
          budget={budget}
        />
      );
    }
    if (role === "school_admin") {
      return (
        <SchoolBudget
          issueId={issueId}
          issueText={issueText}
          budget={budget}
          onSaved={reloadBudget}
        />
      );
    }
    return (
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
      {escrow.tranches ? <ReadAloud text={spokenSummary(escrow)} /> : null}

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
        <FundForm issueId={issueId} onDone={setEscrow} existing={escrow} budget={null} />
      ) : null}

      {escrow.surplus !== null && escrow.surplus !== "0" ? (
        <SweepCard issueId={issueId} escrow={escrow} onDone={reload} />
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

      {!escrow.legacy ? <WhereMoney escrow={escrow.escrow.address} /> : null}

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
  const budget = useQuery(`budget:${issueId}`, () =>
    escrowApi.budget(issueId).catch(() => null),
  );

  if (escrow.error) return <PageError onRetry={escrow.reload} />;
  if (escrow.data === undefined || budget.data === undefined) return <PageLoading />;

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
          budget={budget.data}
          reloadBudget={budget.reload}
          issueText={issue.data ? `${issue.data.title}. ${issue.data.description}` : ""}
        />
      </Container>
    </>
  );
}
