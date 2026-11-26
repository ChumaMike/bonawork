"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Photo } from "@/components/media/photo";
import { Button, ButtonLink } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Container, PageLoading } from "@/components/ui/page";
import { useAudience } from "@/data/audience";
import { SpeakToReport } from "@/features/agent/voice";
import {
  EscrowApiError,
  escrowApi,
  formatWait,
  type EscrowTx,
  type PublicEscrow,
} from "@/features/escrow/api";
import { CAST } from "./cast";
import {
  continueWithCheck2,
  demoActions,
  refreshGuided,
  startGuided,
  switchPerson,
  useGuided,
  type GuidedDemo,
} from "./client";
import { MoneyPath, ProofLink, rand } from "./money-path";
import {
  DEMO_PEOPLE,
  DEMO_PERSON_LABEL,
  personForRole,
  stepCounter,
  stepHref,
  type DemoPerson,
  type StepInfo,
} from "./steps";

const POLLAR_ENABLED = Boolean(process.env.NEXT_PUBLIC_POLLAR_API_KEY);

/** Unix seconds on the server's clock, ticking once a second. */
function useServerClock(skew: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000) + skew);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000) + skew);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [skew]);
  return now;
}

/** The small print every demo screen carries. */
function DemoLabels({ window = false }: { window?: boolean }) {
  return (
    <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">
      Sandbox rand · Solana devnet · Demo people{window ? " · 60-second demo window" : ""}
    </p>
  );
}

// --------------------------------------------------------------- actions

type Sent = { label: string; url: string } | null;

function useAction() {
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

function ActionError({
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

function Sending({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <p className="flex items-center gap-2 text-[0.95rem] font-medium" role="status">
      <Icon name="loader" className="size-4 animate-spin" />
      {label}
    </p>
  );
}

function SentLine({ sent }: { sent: Sent }) {
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

function lastTx(escrow: PublicEscrow | null, step: EscrowTx["step"], index?: 0 | 1) {
  const txs = escrow?.transactions ?? [];
  for (let i = txs.length - 1; i >= 0; i--) {
    if (txs[i].step === step && (index === undefined || txs[i].index === index))
      return txs[i];
  }
  return null;
}

function StepAction({
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
          href={stepHref(step.id, id)}
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

function ScopeStep({ demo }: { demo: GuidedDemo }) {
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

function RestartButton({ primary = false }: { primary?: boolean }) {
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

// ---------------------------------------------------------------- people

export function PeopleList({
  current,
  active,
}: {
  current: DemoPerson | null;
  active: DemoPerson | null;
}) {
  return (
    <ol className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
      {DEMO_PEOPLE.map((p) => (
        <li
          key={p}
          className={`border-t-2 pt-2 ${p === active ? "border-brand" : "border-line"}`}
          data-testid={`cast-${p}`}
        >
          <p className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
            {DEMO_PERSON_LABEL[p]}
            {p === current ? " · you now" : ""}
          </p>
          <p className="font-semibold">{CAST[p].name}</p>
          <p className="text-sm text-muted">{CAST[p].role}</p>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------- screen

function Story({
  demo,
  children,
  lead = true,
}: {
  demo: GuidedDemo | null;
  children?: ReactNode;
  /** True on the start screen, where the story is the page's heading. */
  lead?: boolean;
}) {
  const Heading = lead ? "h1" : "h3";
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
      <Photo
        name="category_sanitation"
        priority
        sizes="(min-width: 1024px) 40vw, 100vw"
        className="overflow-hidden rounded-2xl"
      />
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold tracking-[0.08em] text-earth-strong uppercase">
          {demo
            ? `${demo.schoolName} · ${demo.reference}`
            : "Thandolwethu Primary School, Emseni"}
        </p>
        <Heading
          className={
            lead
              ? "font-display text-[2rem] leading-[1.1] font-semibold tracking-tight sm:text-5xl"
              : "font-display text-2xl leading-tight font-semibold"
          }
        >
          Two of four toilets leak. 380 learners share the two that work.
        </Heading>
        <p className="max-w-prose text-lg">
          A plumber can fix it for {rand(500_000)}. Follow the money from the funder to
          the people who did the work, and see that nobody could take it before it was
          checked.
        </p>
        {children}
      </div>
    </div>
  );
}

export function DemoScreen() {
  const guided = useGuided();
  const audience = useAudience();
  const router = useRouter();
  const skew = guided.status === "ready" ? guided.clockSkew : 0;
  const now = useServerClock(skew);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const step = guided.status === "ready" ? guided.step : null;
  // Waiting steps move on by themselves (the reviewer, the 60 seconds, the Watchdog).
  useEffect(() => {
    if (!step) return;
    const waiting = ["release1", "release2", "review1", "review2", "chain_unreadable"];
    if (!waiting.includes(step.id)) return;
    const timer = setInterval(() => void refreshGuided(), 6000);
    return () => clearInterval(timer);
  }, [step]);

  if (guided.status === "loading" || audience.status === "loading")
    return <PageLoading />;
  if (guided.status === "off") {
    return (
      <Container className="py-16">
        <p className="text-lg">The guided demo is switched off on this server.</p>
      </Container>
    );
  }
  if (guided.status === "error") {
    return (
      <Container className="py-16">
        <p className="text-lg">{guided.message}</p>
      </Container>
    );
  }

  const demo = guided.demo;
  const current = personForRole(audience.role);
  const amounts = demo?.template.amounts ?? [300_000, 200_000];

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      await startGuided(false);
    } catch (e) {
      setStartError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  if (!demo || !step) {
    return (
      <Container className="flex flex-col gap-10 py-8 sm:py-12">
        <Story demo={null}>
          <DemoLabels />
          <Button
            size="lg"
            className="w-full sm:w-auto sm:self-start"
            loading={starting}
            onClick={start}
          >
            Start the demo
            <Icon name="arrowRight" className="size-5" />
          </Button>
          <p className="text-sm text-muted">
            About 2 minutes. You play five demo people. The money is sandbox rand, the
            transactions are real on Solana devnet.
          </p>
          {startError ? <p className="font-medium text-danger">{startError}</p> : null}
        </Story>
        <section className="flex flex-col gap-4" aria-labelledby="path-title">
          <h2 id="path-title" className="font-display text-2xl font-semibold">
            Where the money goes
          </h2>
          <MoneyPath
            escrow={null}
            amounts={amounts}
            funderName={CAST.funder.name}
            now={now}
          />
        </section>
        <section className="flex flex-col gap-4" aria-labelledby="people-title">
          <h2 id="people-title" className="font-display text-2xl font-semibold">
            The people
          </h2>
          <PeopleList current={null} active={null} />
        </section>
      </Container>
    );
  }

  const needed = step.person;
  const wrongPerson = needed !== null && needed !== current;
  const shared = demo.shared;

  async function become(person: DemoPerson) {
    setSwitching(true);
    setSwitchError(null);
    try {
      await switchPerson(person);
      const href = stepHref(step!.id, demo!.caseId);
      if (href !== "/demo") router.push(href);
    } catch (e) {
      setSwitchError((e as Error).message);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Container className="flex flex-col gap-8 py-6 sm:py-10">
      {guided.notice ? (
        <p className="border-l-4 border-sun py-1 pl-4 font-medium" role="status">
          {guided.notice}
        </p>
      ) : null}

      <section
        className="flex flex-col gap-5"
        aria-labelledby="step-title"
        data-testid="demo-step"
        data-step={step.id}
      >
        <p className="text-sm font-semibold tracking-[0.08em] text-brand-strong uppercase">
          {stepCounter(step)}
          {needed ? ` · ${DEMO_PERSON_LABEL[needed]}` : ""}
        </p>
        <h1
          id="step-title"
          className="max-w-3xl font-display text-[2rem] leading-[1.1] font-semibold tracking-tight sm:text-5xl"
        >
          {step.title}
        </h1>
        <p className="max-w-2xl text-lg">{step.why}</p>

        <div className="flex max-w-2xl flex-col gap-4">
          {shared ? (
            <p className="text-[0.95rem]">
              You are watching a shared sample case, so the buttons are off. Its state
              updates as other people use it.
            </p>
          ) : wrongPerson ? (
            <>
              <p className="text-[0.95rem]">
                This step is done by{" "}
                <span className="font-semibold">
                  {CAST[needed].name}, {CAST[needed].role.split(",")[0].toLowerCase()}
                </span>
                .{" "}
                <span className="text-xs font-semibold tracking-[0.12em] uppercase">
                  Demo person
                </span>
              </p>
              <Button
                size="lg"
                className="w-full sm:w-auto sm:self-start"
                loading={switching}
                onClick={() => become(needed)}
              >
                Continue as {CAST[needed].name}
                <Icon name="arrowRight" className="size-5" />
              </Button>
              {switchError ? <p className="text-danger">{switchError}</p> : null}
            </>
          ) : (
            <StepAction
              key={`${step.id}:${demo.caseId}`}
              step={step}
              demo={demo}
              now={now}
            />
          )}
        </div>
      </section>

      <section
        className="flex flex-col gap-4 border-t border-line pt-6"
        aria-labelledby="path-title"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="path-title" className="font-display text-2xl font-semibold">
            Where the money is
          </h2>
          <DemoLabels window={step.id === "release1" || step.id === "release2"} />
        </div>
        <MoneyPath
          escrow={demo.escrow}
          amounts={amounts}
          funderName={CAST.funder.name}
          now={now}
        />
      </section>

      <section
        className="flex flex-col gap-4 border-t border-line pt-6"
        aria-labelledby="case-title"
      >
        <h2 id="case-title" className="sr-only">
          The case
        </h2>
        <Story demo={demo} lead={false} />
        <PeopleList current={current} active={needed} />
      </section>

      <details className="border-t border-line pt-4 text-sm text-muted">
        <summary className="cursor-pointer font-medium text-ink">
          Technical details
        </summary>
        <div className="mt-2 flex flex-col gap-1">
          <p>
            Escrow program on Solana devnet. Token: sandbox demo rand (BDZAR), no real
            value. The demo people sign with keys held by the server.
          </p>
          {demo.escrow ? (
            <p className="font-mono break-all">
              Escrow {demo.escrow.escrow.address} · Program {demo.escrow.programId}
            </p>
          ) : null}
          <p>
            <a href={`/issues/${demo.caseId}`} className="underline">
              The case page
            </a>{" "}
            ·{" "}
            <a href={`/issues/${demo.caseId}/escrow`} className="underline">
              The full escrow screen
            </a>
          </p>
          <RestartButton />
        </div>
      </details>
    </Container>
  );
}
