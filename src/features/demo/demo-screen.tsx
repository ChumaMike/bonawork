"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { SpeakToReport } from "@/features/agent/voice";
import {
  EscrowApiError,
  escrowApi,
  formatWait,
  type EscrowTx,
  type PublicEscrow,
} from "@/features/escrow/api";
import {
  continueWithCheck2,
  demoActions,
  refreshGuided,
  startGuided,
  type GuidedDemo,
} from "./client";
import { ProofLink, rand } from "./money-path";
import { stepHref, type StepInfo } from "./steps";

const POLLAR_ENABLED = Boolean(process.env.NEXT_PUBLIC_POLLAR_API_KEY);

/** Unix seconds on the server's clock, ticking once a second. */
export function useServerClock(skew: number) {
  // 0 until mounted: a prerendered page must not read the clock.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000) + skew);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [skew]);
  return now;
}

// --------------------------------------------------------------- actions

type Sent = { label: string; url: string } | null;

export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; program: string | null } | null>(
    null,
  );
  const [sent, setSent] = useState<Sent>(null);
  async function run(label: string, fn: () => Promise<Sent | void>) {
    setBusy(label);
    setError(null);
    setSent(null);
    try {
      const result = await fn();
      if (result) setSent(result);
      await refreshGuided();
    } catch (e) {
      setError({
        message: (e as Error).message,
        program: e instanceof EscrowApiError ? e.programError : null,
      });
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, sent, run, setError };
}

export function ActionError({
  error,
}: {
  error: { message: string; program: string | null } | null;
}) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-col gap-1 border-l-4 border-danger py-1 pl-4">
      <p className="font-medium text-danger">{error.message}</p>
      {error.program ? (
        <p className="font-mono text-xs text-muted">Program said: {error.program}</p>
      ) : null}
    </div>
  );
}

export function Sending({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <p className="flex items-center gap-2 text-[0.95rem] font-medium" role="status">
      <Icon name="loader" className="size-4 animate-spin" />
      {label}
    </p>
  );
}

export function SentLine({ sent }: { sent: Sent }) {
  if (!sent) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-[0.95rem]" role="status">
      <Icon name="check" className="size-4 text-st-verified" />
      {sent.label}
      <a
        href={sent.url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-brand-strong underline"
      >
        On Solana: view transaction
      </a>
    </p>
  );
}

// ------------------------------------------------------------------ steps

export function lastTx(escrow: PublicEscrow | null, step: EscrowTx["step"], index?: 0 | 1) {
  const txs = escrow?.transactions ?? [];
  for (let i = txs.length - 1; i >= 0; i--) {
    if (txs[i].step === step && (index === undefined || txs[i].index === index))
      return txs[i];
  }
  return null;
}

export function StepAction({
  step,
  demo,
  now,
}: {
  step: StepInfo;
  demo: GuidedDemo;
  now: number;
}) {
  const action = useAction();
  const [note, setNote] = useState(() => {
    if (step.id === "report") return demo.template.reportNote;
    if (step.id === "claim1") return demo.template.claimNotes[0];
    if (step.id === "claim2") return demo.template.claimNotes[1];
    if (step.id === "school2") return demo.template.schoolDoneNote;
    return "";
  });
  const id = demo.caseId;
  const [materials, labour] = demo.template.amounts;
  const busy = action.busy !== null;

  const noteField = (label: string, voice = false) => (
    <div className="flex flex-col gap-2">
      <label htmlFor="demo-note" className="font-medium">
        {label}
      </label>
      <Textarea
        id="demo-note"
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {voice ? (
        <SpeakToReport onText={(text) => setNote((n) => (n ? `${n} ${text}` : text))} />
      ) : null}
    </div>
  );

  const footer = (
    <>
      <Sending label={action.busy} />
      <SentLine sent={action.sent} />
      <ActionError error={action.error} />
    </>
  );

  switch (step.id) {
    case "report":
      return (
        <>
          {noteField("What the school saw (type, or speak in your language)", true)}
          <Button
            size="lg"
            className="w-full sm:w-auto sm:self-start"
            disabled={!note.trim() || busy}
            loading={busy}
            onClick={() =>
              action.run("Saving the report…", async () => {
                await demoActions.logProblem(id, note.trim());
              })
            }
          >
            Log the problem
          </Button>
          {footer}
        </>
      );

    case "scope":
      return <ScopeStep demo={demo} />;

    case "fund":
      return (
        <>
          <p className="text-[0.95rem]">
            {rand(materials)} is set aside for the materials and goes to the supplier
            after Check 1. {rand(labour)} is for the plumber&apos;s work and goes to the
            contractor after Check 2. Who gets each part is fixed now and cannot be
            changed later.
          </p>
          <Button
            size="lg"
            className="w-full sm:w-auto sm:self-start"
            loading={busy}
            onClick={() =>
              action.run("Sending to Solana… this takes up to a minute.", async () => {
                const escrow = await escrowApi.fund(id, {
                  materials: String(materials),
                  completion: String(labour),
                  challengeSeconds: demo.template.challengeSeconds,
                  materialsPayee: "demo_supplier",
                });
                const tx = lastTx(escrow, "activate") ?? lastTx(escrow, "fund");
                return tx
                  ? { label: `${rand(materials + labour)} is held.`, url: tx.url }
                  : null;
              })
            }
          >
            Put in {rand(materials + labour)}, held until checked
          </Button>
          <p className="text-sm text-muted">
            The demo funder key signs on the server (devnet).
            {POLLAR_ENABLED ? (
              <>
                {" "}
                Or{" "}
                <a className="underline" href={`/issues/${id}/escrow`}>
                  pay with Pollar
                </a>{" "}
                from your own email wallet.
              </>
            ) : null}
          </p>
          {footer}
        </>
      );

    case "claim1":
    case "claim2": {
      const index = step.id === "claim1" ? 0 : 1;
      return (
        <>
          {noteField(index === 0 ? "What was delivered" : "What was done")}
          <Button
            size="lg"
            className="w-full sm:w-auto sm:self-start"
            disabled={!note.trim() || busy}
            loading={busy}
            onClick={() =>
              action.run("Sending to Solana…", async () => {
                const sent = await escrowApi.claim(id, { index, note: note.trim() });
                return { label: `Check ${index + 1} asked for.`, url: sent.explorerUrl };
              })
            }
          >
            Ask for Check {index + 1}: {rand(index === 0 ? materials : labour)}
          </Button>
          {footer}
        </>
      );
    }

    case "school2":
      return (
        <>
          {noteField("What the school can see now")}
          <Button
            size="lg"
            className="w-full sm:w-auto sm:self-start"
            disabled={!note.trim() || busy}
            loading={busy}
            onClick={() =>
              action.run("Saving…", async () => {
                await demoActions.schoolSaysDone(id, note.trim());
              })
            }
          >
            Say the repair is finished
          </Button>
          <p className="text-sm text-muted">
            The case now shows &ldquo;repair claimed&rdquo;, not verified.
          </p>
          {footer}
        </>
      );

    case "review1":
    case "review2":
      return (
        <ButtonLink
          size="lg"
          className="w-full sm:w-auto sm:self-start"
          href={stepHref(step.id)}
        >
          Open the checklist
          <Icon name="arrowRight" className="size-5" />
        </ButtonLink>
      );

    case "release1":
    case "release2": {
      const index = step.id === "release1" ? 0 : 1;
      const tranche = demo.escrow?.tranches?.[index];
      const left = tranche ? Number(tranche.challengeUntil) - now : 0;
      const payee = index === 0 ? "the supplier" : "the contractor";
      const amount = rand(index === 0 ? materials : labour);
      return (
        <>
          <div className="flex items-baseline gap-3">
            <p
              className="font-display text-5xl font-semibold tabular-nums sm:text-6xl"
              data-testid="demo-countdown"
              aria-live="polite"
            >
              {left > 0 ? formatWait(left) : "0 s"}
            </p>
            <p className="text-muted">
              {left > 0 ? "until anyone can release it" : "the wait is over"}
            </p>
          </div>
          {left > 0 ? (
            <Button
              size="lg"
              variant="secondary"
              className="w-full sm:w-auto sm:self-start"
              loading={busy}
              onClick={() =>
                action.run("Sending to Solana…", async () => {
                  await escrowApi.release(id, index);
                })
              }
            >
              Try to release it now
            </Button>
          ) : (
            <Button
              size="lg"
              className="w-full sm:w-auto sm:self-start"
              loading={busy}
              onClick={() =>
                action.run("Sending to Solana…", async () => {
                  const sent = await escrowApi.release(id, index);
                  return {
                    label: `${amount} released to ${payee}.`,
                    url: sent.explorerUrl,
                  };
                })
              }
            >
              Release {amount} to {payee}
            </Button>
          )}
          {action.error && action.error.program === "ChallengeWindowActive" ? (
            <div
              role="alert"
              className="flex flex-col gap-1 border-l-4 border-st-verified py-1 pl-4"
            >
              <p className="font-medium">
                Refused by the program on Solana. That is the rule working.
              </p>
              <p className="text-[0.95rem]">{action.error.message}</p>
              <p className="font-mono text-xs text-muted">
                Program said: ChallengeWindowActive
              </p>
            </div>
          ) : (
            <ActionError error={action.error} />
          )}
          <Sending label={action.busy} />
          <SentLine sent={action.sent} />
        </>
      );
    }

    case "proof": {
      const release = lastTx(demo.escrow, "release", 0);
      return (
        <>
          <ul className="flex flex-col gap-2 text-[0.95rem]">
            <ProofRow
              tx={lastTx(demo.escrow, "activate")}
              text={`${rand(materials + labour)} held`}
            />
            <ProofRow
              tx={lastTx(demo.escrow, "claim", 0)}
              text="Contractor asked for Check 1"
            />
            <ProofRow
              tx={lastTx(demo.escrow, "verify", 0)}
              text="Reviewer signed Check 1"
            />
            <ProofRow tx={release} text={`${rand(materials)} released to the supplier`} />
          </ul>
          {release ? (
            <ButtonLink
              size="lg"
              className="w-full sm:w-auto sm:self-start"
              href={release.url}
              target="_blank"
              rel="noreferrer"
            >
              See the release on Solana Explorer
              <Icon name="link" className="size-5" />
            </ButtonLink>
          ) : null}
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-[0.95rem]">
              <span className="font-semibold">Check 2 works the same way.</span> The
              contractor asks, the school says the repair is finished, the reviewer checks
              the work, and after 60 seconds the last {rand(labour)} goes to the
              contractor.
            </p>
            <Button
              variant="secondary"
              className="w-full sm:w-auto sm:self-start"
              onClick={() => continueWithCheck2(id)}
            >
              Carry on with Check 2
            </Button>
          </div>
        </>
      );
    }

    case "done":
      return (
        <>
          <ul className="flex flex-col gap-2 text-[0.95rem]">
            <ProofRow
              tx={lastTx(demo.escrow, "release", 0)}
              text={`${rand(materials)} released to the supplier`}
            />
            <ProofRow
              tx={lastTx(demo.escrow, "release", 1)}
              text={`${rand(labour)} released to the contractor`}
            />
          </ul>
          <RestartButton primary />
        </>
      );

    case "off_path":
      return <RestartButton primary />;

    case "chain_unreadable":
      return (
        <Button size="lg" variant="secondary" onClick={() => void refreshGuided()}>
          Read Solana again
        </Button>
      );
  }
}

function ProofRow({ tx, text }: { tx: EscrowTx | null; text: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line pb-2">
      <span className="flex items-center gap-2">
        <Icon name={tx ? "check" : "clock"} className="size-4" />
        {text}
      </span>
      <ProofLink tx={tx} />
    </li>
  );
}

type PriceCheck = Awaited<ReturnType<typeof demoActions.priceCheck>>;

const LEVEL_TEXT: Record<PriceCheck["lines"][number]["level"], string> = {
  ok: "Within shop prices",
  check: "Above shop prices: ask why",
  high: "Far above shop prices",
  unavailable: "No shop price (labour)",
};

export function ScopeStep({ demo }: { demo: GuidedDemo }) {
  const action = useAction();
  const [check, setCheck] = useState<PriceCheck | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    demoActions.priceCheck().then(setCheck, (e: Error) => setLoadError(e.message));
  }, []);
  const [materials, labour] = demo.template.amounts;
  const levelOf = (lineId: string) => check?.lines.find((l) => l.lineId === lineId);

  return (
    <>
      <table className="w-full text-left text-[0.95rem]">
        <caption className="sr-only">The job, line by line, with the price check</caption>
        <thead className="text-xs tracking-[0.08em] text-muted uppercase">
          <tr>
            <th className="pb-2 font-semibold">Item</th>
            <th className="pb-2 text-right font-semibold">Cost</th>
          </tr>
        </thead>
        <tbody>
          {demo.template.lines.map((l) => {
            const r = levelOf(l.lineId);
            return (
              <tr key={l.lineId} className="border-t border-line align-top">
                <td className="py-2 pr-3">
                  <p className="font-medium">
                    {l.quantity} × {l.description}
                  </p>
                  <p className="text-sm text-muted">
                    {r
                      ? `${LEVEL_TEXT[r.level]}${r.medianCents ? `: shops ask about ${rand(r.medianCents)} each` : ""}`
                      : loadError
                        ? "Price check not available"
                        : "Checking shop prices…"}
                  </p>
                </td>
                <td className="py-2 text-right font-mono whitespace-nowrap">
                  {rand(l.quantity * l.unitPriceCents)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink">
            <td className="pt-2 font-semibold">Check 1, materials (to the supplier)</td>
            <td className="pt-2 text-right font-mono font-semibold">{rand(materials)}</td>
          </tr>
          <tr>
            <td className="font-semibold">Check 2, labour (to the contractor)</td>
            <td className="text-right font-mono font-semibold">{rand(labour)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="text-sm text-muted">
        Compared with recorded prices from South African hardware shops (sample data).
      </p>
      <Button
        size="lg"
        className="w-full sm:w-auto sm:self-start"
        loading={action.busy !== null}
        onClick={() =>
          action.run("Saving…", async () => {
            await demoActions.confirmScope();
          })
        }
      >
        Confirm the job and prices
      </Button>
      <ActionError error={action.error} />
    </>
  );
}

export function RestartButton({ primary = false }: { primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        size={primary ? "lg" : "sm"}
        variant={primary ? "primary" : "quiet"}
        className={primary ? "w-full sm:w-auto" : "self-start"}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await startGuided(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Restart demo
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

