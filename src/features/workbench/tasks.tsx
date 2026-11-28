"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { CAST, SUPPLIER_NAME } from "@/features/demo/cast";
import { demoActions, refreshGuided, type GuidedDemo } from "@/features/demo/client";
import {
  ActionError,
  ScopeStep,
  Sending,
  SentLine,
  lastTx,
  useAction,
} from "@/features/demo/demo-screen";
import type { StepInfo } from "@/features/demo/steps";
import { escrowApi } from "@/features/escrow/api";
import { ReviewTask } from "@/features/escrow/review-screen";
import { GuardianNote, ProofPhoto, TaskHeading, splitOf } from "./bench";
import { NotYourTurn } from "./live";
import { clock, rand } from "./model";

const POLLAR_ENABLED = Boolean(process.env.NEXT_PUBLIC_POLLAR_API_KEY);

function Shared() {
  return (
    <p className="text-[0.95rem] text-muted">
      You are watching a shared sample case, so the buttons are off. It moves as other people use
      it.
    </p>
  );
}

function Footer({ action }: { action: ReturnType<typeof useAction> }) {
  return (
    <>
      <Sending label={action.busy} />
      <SentLine sent={action.sent} />
      <ActionError error={action.error} />
    </>
  );
}

// ------------------------------------------------------------------ school

/** The school's task: finish the report, check the quote, object or confirm. */
export function SchoolTask({ demo, step, now }: { demo: GuidedDemo; step: StepInfo; now: number }) {
  const t0 = demo.escrow?.tranches?.[0];
  const t1 = demo.escrow?.tranches?.[1];
  if (demo.shared) return <Shared />;

  if (step.id === "report") {
    return (
      <>
        <TaskHeading title="Finish the report on the toilets">
          A parent reported it. Add what the school sees and how it affects the learners.
        </TaskHeading>
        <ButtonLink href="/report" size="lg" className="w-full sm:w-auto sm:self-start">
          Finish the report
        </ButtonLink>
      </>
    );
  }
  if (step.id === "scope") {
    return (
      <>
        <TaskHeading title="Check the contractor's quote">
          Each line is compared with prices at South African shops. You do not set a price: you
          confirm the job is right.
        </TaskHeading>
        <ScopeStep demo={demo} />
      </>
    );
  }
  if (step.id === "school2") return <SchoolSaysDone demo={demo} />;

  // During a check's wait, the school is the one who may object.
  const waiting =
    (step.id === "release1" && t0?.state === "Verified" ? t0 : null) ??
    (step.id === "release2" && t1?.state === "Verified" ? t1 : null);
  if (waiting) {
    const left = Number(waiting.challengeUntil) - now;
    return <SchoolObjection demo={demo} index={waiting.index} left={left} />;
  }
  return <NotYourTurn step={step} person="school" />;
}

function SchoolObjection({ demo, index, left }: { demo: GuidedDemo; index: 0 | 1; left: number }) {
  const [said, setSaid] = useState<"object" | "fine" | null>(null);
  const [m, l] = splitOf(demo);
  const first = index === 0;
  return (
    <>
      <div className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-[1_1_320px]">
          <TaskHeading
            title={
              first
                ? "The materials for the toilets arrived. Is anything wrong?"
                : "The plumber says the toilets work. Is anything wrong?"
            }
          >
            Sipho Mokoena checked {first ? "them" : "the work"} on site and signed. If you do
            nothing, {rand(first ? m : l)} can be released to{" "}
            {first ? SUPPLIER_NAME : CAST.contractor.name} when the time runs out.
          </TaskHeading>
        </div>
        <div className="flex min-w-44 flex-col gap-1 rounded-2xl bg-accent-soft px-5 py-4">
          <span className="text-sm text-accent-strong">Time to object</span>
          <span
            className="text-[3.25rem] leading-none font-bold tracking-[-0.04em] tabular-nums"
            data-testid="object-countdown"
          >
            {clock(left)}
          </span>
          <span className="text-xs text-accent-strong">60-second demo window</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <ProofPhoto photo="toilets_before" alt="The broken toilets, as reported" caption="As reported" example />
        <ProofPhoto
          photo={first ? "materials_on_site" : "plumber_fixing"}
          alt={first ? "The materials on site" : "The plumber at work"}
          caption={first ? "Materials, by Themba" : "Work, by Themba"}
          example
        />
        <ProofPhoto photo="reviewer_inspecting" alt="Sipho checking on site" caption="Checked by Sipho" example />
      </div>
      {said === "object" ? (
        <p role="status" className="border-l-4 border-danger py-1 pl-4">
          Objections are not switched on in this demo, so the money still moves after the wait. On
          a real case an objection stops the money until a dispute reviewer looks at it.
        </p>
      ) : said === "fine" ? (
        <p role="status" className="border-l-4 border-st-verified py-1 pl-4">
          Noted. Nothing else is needed from you for this check.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          variant="secondary"
          className="border-2 border-danger text-danger hover:border-danger"
          onClick={() => setSaid("object")}
        >
          Object to Check {index + 1}
        </Button>
        <Button size="lg" onClick={() => setSaid("fine")}>
          Looks right
        </Button>
        <span className="text-sm text-muted">
          Objecting stops the money until a dispute reviewer looks at it.
        </span>
      </div>
    </>
  );
}

function SchoolSaysDone({ demo }: { demo: GuidedDemo }) {
  const action = useAction();
  const [note, setNote] = useState(demo.template.schoolDoneNote);
  return (
    <>
      <TaskHeading title="Is the repair finished?">
        Say so only if the toilets work. Your word is a claim, not proof: the case stays &ldquo;repair
        claimed&rdquo; until Sipho checks.
      </TaskHeading>
      <div className="grid grid-cols-2 gap-2.5 sm:max-w-lg">
        <ProofPhoto photo="toilets_before" alt="The toilets before" caption="Before" example />
        <ProofPhoto
          photo="toilets_after"
          alt="The toilets after the repair"
          caption="After, by Themba"
          example
        />
      </div>
      <label htmlFor="school-done" className="font-medium">
        What the school can see now
      </label>
      <Textarea id="school-done" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      <Button
        size="lg"
        className="w-full sm:w-auto sm:self-start"
        disabled={!note.trim() || action.busy !== null}
        loading={action.busy !== null}
        onClick={() =>
          action.run("Saving…", async () => {
            await demoActions.schoolSaysDone(demo.caseId, note.trim());
          })
        }
      >
        Say the repair is finished
      </Button>
      <Footer action={action} />
    </>
  );
}

// ------------------------------------------------------------------ funder

/** The funder's lock panel for the live case. */
export function FunderLock({ demo, step }: { demo: GuidedDemo; step: StepInfo }) {
  const action = useAction();
  const [m, l] = demo.template.amounts;
  const total = m + l;
  if (demo.shared) return <Shared />;
  const mine = step.id === "fund";
  const funded = demo.escrow?.funded === true;
  return (
    <>
      <LockPanel
        title={funded ? `${rand(total)} is locked for the toilets` : `Lock ${rand(total)} to fix two toilets`}
        split={[m, l]}
        note={
          funded
            ? "It moves in two parts, each only after an independent check."
            : "Nobody can spend it straight away. It moves in two parts, each only after an independent check."
        }
      />
      {mine ? (
        <>
          <GuardianNote>
            <strong className="font-semibold">What this transaction does.</strong> It locks{" "}
            {rand(total)} in this case&apos;s account on Solana and sends nothing to anyone yet. Who
            gets each part is fixed now and cannot be changed later.
          </GuardianNote>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              loading={action.busy !== null}
              onClick={() =>
                action.run("Sending to Solana… this takes up to a minute.", async () => {
                  const escrow = await escrowApi.fund(demo.caseId, {
                    materials: String(m),
                    completion: String(l),
                    challengeSeconds: demo.template.challengeSeconds,
                    materialsPayee: "demo_supplier",
                  });
                  const tx = lastTx(escrow, "activate") ?? lastTx(escrow, "fund");
                  return tx ? { label: `${rand(total)} is locked.`, url: tx.url } : null;
                })
              }
            >
              Lock {rand(total)}
            </Button>
            <span className="text-sm text-muted">
              Sandbox rand. The lock is a real transaction on Solana devnet, signed by the demo
              funder key on the server.
            </span>
          </div>
          {POLLAR_ENABLED ? (
            <p className="text-sm text-muted">
              Or{" "}
              <a className="underline" href={`/issues/${demo.caseId}/escrow`}>
                lock it from your own email wallet (Pollar)
              </a>
              .
            </p>
          ) : null}
          <Footer action={action} />
        </>
      ) : (
        <NotYourTurn step={step} person="funder" />
      )}
    </>
  );
}

/** The split of a repair's money, line by line. */
export function LockPanel({
  title,
  split,
  note,
  payees = [SUPPLIER_NAME, `${CAST.contractor.name}, plumber`],
}: {
  title: string;
  split: [number, number];
  note: string;
  payees?: [string, string];
}) {
  return (
    <>
      <TaskHeading title={title}>{note}</TaskHeading>
      <div className="flex flex-col border-t border-line">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-line py-4">
          <span className="leading-snug">
            <strong className="font-semibold">Check 1: materials on site</strong>
            <br />
            <span className="text-muted">Goes to {payees[0]}</span>
          </span>
          <strong className="text-[1.375rem]">{rand(split[0])}</strong>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-line py-4">
          <span className="leading-snug">
            <strong className="font-semibold">Check 2: work done</strong>
            <br />
            <span className="text-muted">Goes to {payees[1]}</span>
          </span>
          <strong className="text-[1.375rem]">{rand(split[1])}</strong>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-4">
          <span className="text-muted">Prices were checked against local shops.</span>
          <strong className="text-[1.375rem]">{rand(split[0] + split[1])}</strong>
        </div>
      </div>
    </>
  );
}

// -------------------------------------------------------------- contractor

/** The contractor asks for Check 1 or Check 2. */
export function ContractorTask({ demo, step }: { demo: GuidedDemo; step: StepInfo }) {
  if (demo.shared) return <Shared />;
  if (step.id !== "claim1" && step.id !== "claim2")
    return <NotYourTurn step={step} person="contractor" />;
  return <Claim key={step.id} demo={demo} index={step.id === "claim1" ? 0 : 1} />;
}

function Claim({ demo, index }: { demo: GuidedDemo; index: 0 | 1 }) {
  const action = useAction();
  const [note, setNote] = useState(demo.template.claimNotes[index]);
  const [m, l] = splitOf(demo);
  const first = index === 0;
  return (
    <>
      <TaskHeading title={first ? "Ask for Check 1: materials on site" : "Ask for Check 2: work done"}>
        {first
          ? "Say what was delivered to the school. Sipho will come and check it against the quote."
          : "Say what you did. The school confirms, then Sipho checks the work."}
      </TaskHeading>
      <div className="flex flex-col gap-2">
        <span className="font-semibold">{first ? "Photos of the materials on site" : "Photos of the finished work"}</span>
        <div className="grid grid-cols-3 gap-2.5">
          <ProofPhoto photo="toilets_before" alt="The toilet block" caption="The site" example />
          <ProofPhoto
            photo={first ? "materials_on_site" : "plumber_fixing"}
            alt={first ? "The materials at the school" : "The cisterns being fitted"}
            caption={first ? "Cisterns, valves and pipe" : "Fitting the cisterns"}
            example
          />
          <ProofPhoto
            photo={first ? "evidence_capture" : "toilets_after"}
            alt={first ? "Photographing the delivery" : "The toilets working"}
            caption={first ? "The delivery" : "All four flush"}
            example
          />
        </div>
      </div>
      {first ? (
        <div className="flex flex-wrap items-center gap-4 rounded-[14px] border border-line bg-surface px-4 py-4">
          <span className="min-w-0 flex-[1_1_260px] leading-snug">
            <strong className="font-semibold">Materials, as quoted</strong>
            <br />
            <span className="text-muted">
              {SUPPLIER_NAME} · {rand(m)} · matches the checked quote
            </span>
          </span>
        </div>
      ) : null}
      <label htmlFor="claim-note" className="font-medium">
        {first ? "What was delivered" : "What was done"}
      </label>
      <Textarea id="claim-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="rounded-[14px] bg-brand-soft px-4 py-4 text-[0.95rem] leading-normal">
        {first
          ? `The ${rand(m)} goes to the supplier, not to you. Your ${rand(l)} comes at Check 2, when the toilets work and the school agrees.`
          : `This ${rand(l)} is yours, for the labour. It is released after Sipho signs and a short wait.`}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={!note.trim() || action.busy !== null}
          loading={action.busy !== null}
          onClick={() =>
            action.run("Sending to Solana…", async () => {
              const sent = await escrowApi.claim(demo.caseId, { index, note: note.trim() });
              return { label: `Check ${index + 1} asked for.`, url: sent.explorerUrl };
            })
          }
        >
          Ask for Check {index + 1}
        </Button>
        <span className="text-sm text-muted">Sipho and the school are told straight away.</span>
      </div>
      <Footer action={action} />
    </>
  );
}

// ---------------------------------------------------------------- reviewer

/** The reviewer checks and signs, with the real checklist and Bona Guardian. */
export function ReviewerTask({ demo, step }: { demo: GuidedDemo; step: StepInfo }) {
  if (demo.shared) return <Shared />;
  if (step.id !== "review1" && step.id !== "review2")
    return <NotYourTurn step={step} person="reviewer" />;
  const index = step.id === "review1" ? 0 : 1;
  const [m, l] = splitOf(demo);
  return (
    <>
      <TaskHeading
        title={index === 0 ? "Are the materials really on site?" : "Is the work really done?"}
      >
        If you sign, {rand(index === 0 ? m : l)} can go to{" "}
        {index === 0 ? SUPPLIER_NAME : CAST.contractor.name} after the school&apos;s 60 seconds.
      </TaskHeading>
      <div className="grid grid-cols-3 gap-2.5">
        <ProofPhoto photo="toilets_before" alt="The toilet block" caption="The site" example />
        <ProofPhoto
          photo={index === 0 ? "materials_on_site" : "toilets_after"}
          alt={index === 0 ? "Toilet cisterns on site" : "The repaired toilets"}
          caption={index === 0 ? "Cisterns and valves" : "After the repair"}
          example
        />
        <ProofPhoto
          photo={index === 0 ? "evidence_capture" : "plumber_fixing"}
          alt={index === 0 ? "Pipe and fittings" : "The plumber at work"}
          caption={index === 0 ? "Pipe and fittings" : "Fitting"}
          example
        />
      </div>
      <ReviewTask
        key={`${demo.caseId}:${index}`}
        issueId={demo.caseId}
        stage={index}
        backHref="/demo"
        backLabel="See it on the public case page"
        onSigned={() => void refreshGuided()}
      />
      <p className="text-sm text-muted">You sign with the reviewer key. AI never signs.</p>
    </>
  );
}
