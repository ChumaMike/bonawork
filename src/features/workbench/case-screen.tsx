"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import type { PhotoName } from "@/components/media/manifest";
import { Photo } from "@/components/media/photo";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/page";
import { CAST, SUPPLIER_NAME } from "@/features/demo/cast";
import type { GuidedDemo } from "@/features/demo/client";
import { RestartButton, StepAction } from "@/features/demo/demo-screen";
import { stepCounter, type StepInfo } from "@/features/demo/steps";
import { exampleBySlug } from "./fixtures";
import { StartHere, useBecome, useLive } from "./live";
import { MoneyLine } from "./money-line";
import { exampleLine, guidedLine, type CaseLine } from "./model";

/** The headline of the live demo case. */
export const DEMO_HEADLINE = "Two of four toilets leak. 380 learners share the two that work.";

function CaseLayout({
  school,
  title,
  photo,
  band,
  line,
  people,
  children,
}: {
  school: string;
  title: string;
  photo: PhotoName;
  band: ReactNode;
  line: CaseLine;
  people: [string, string][];
  children?: ReactNode;
}) {
  return (
    <div className="page-wrap flex flex-col gap-8 pt-0 pb-14 sm:gap-9 sm:pt-10">
      <section className="flex flex-col-reverse gap-5 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-8">
        <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-2.5">
          <Link href="/schools" className="text-sm text-muted">
            {school}
          </Link>
          <h1 className="text-[1.7rem] leading-[1.06] font-bold tracking-[-0.04em] sm:text-[2.75rem]">
            {title}
          </h1>
        </div>
        <Photo
          name={photo}
          alt="The problem, as reported"
          priority
          shape="free"
          sizes="(min-width: 640px) 260px, 100vw"
          className="-mx-4 h-44 w-[calc(100%+2rem)] sm:mx-0 sm:h-[170px] sm:w-[260px] sm:rounded-[14px]"
        />
      </section>
      <section
        className="flex flex-wrap items-center gap-4 rounded-2xl bg-brand-soft px-5 py-4 sm:px-6"
        aria-label="Next step"
        data-testid="next-band"
      >
        {band}
      </section>
      <MoneyLine line={line} />
      <section className="flex flex-wrap gap-x-7 gap-y-2 border-t border-line pt-5 text-sm text-muted">
        {people.map(([role, name]) => (
          <span key={role}>
            <strong className="font-semibold text-ink">{role}</strong> {name}
          </span>
        ))}
      </section>
      {children}
    </div>
  );
}

const LIVE_PEOPLE: [string, string][] = [
  ["School", CAST.school.name],
  ["Funder", CAST.funder.name],
  ["Contractor", CAST.contractor.name],
  ["Supplier", SUPPLIER_NAME],
  ["Reviewer", CAST.reviewer.name],
];

/** The public case page of the guided demo: `/demo`. */
export function DemoCaseScreen() {
  const live = useLive();
  if (live.loading) return <PageLoading />;
  if (live.guided.status === "off")
    return <p className="page-wrap py-16 text-lg">The guided demo is switched off on this server.</p>;
  if (live.guided.status === "error")
    return <p className="page-wrap py-16 text-lg">{live.guided.message}</p>;
  const { demo, step, now } = live;
  if (!demo || !step) {
    return (
      <CaseLayout
        school="Thandolwethu Primary, Emseni"
        title={DEMO_HEADLINE}
        photo="category_sanitation"
        band={<StartBand />}
        line={{ ...guidedLine(EMPTY_DEMO, now) }}
        people={LIVE_PEOPLE}
      />
    );
  }
  return (
    <CaseLayout
      school={`${demo.schoolName}, Emseni · ${demo.reference}`}
      title={DEMO_HEADLINE}
      photo="category_sanitation"
      band={<LiveBand demo={demo} step={step} now={now} />}
      line={guidedLine(demo, now)}
      people={LIVE_PEOPLE}
    >
      <details className="border-t border-line pt-4 text-sm text-muted">
        <summary className="cursor-pointer font-medium text-ink">Technical details</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>
            Escrow program on Solana devnet. Token: sandbox demo rand (BDZAR), no real value. The
            demo people sign with keys held by the server.
          </p>
          {demo.escrow ? (
            <p className="font-mono break-all">
              Escrow {demo.escrow.escrow.address} · Program {demo.escrow.programId}
            </p>
          ) : null}
          <p>
            <a href={`/issues/${demo.caseId}`} className="underline">
              The full case record
            </a>{" "}
            ·{" "}
            <a href={`/issues/${demo.caseId}/escrow`} className="underline">
              The full escrow screen
            </a>
          </p>
          <RestartButton />
        </div>
      </details>
    </CaseLayout>
  );
}

function StartBand() {
  return (
    <div className="flex-[1_1_420px]">
      <StartHere person="public" />
    </div>
  );
}

/** What happens next, and the button for it when the public can do it. */
function LiveBand({ demo, step, now }: { demo: GuidedDemo; step: StepInfo; now: number }) {
  const { become, busy, error } = useBecome();
  const publicTurn = step.person === "public" || step.person === null;
  if (publicTurn) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div>
          <p className="text-sm text-muted">Demo · {stepCounter(step)}</p>
          <p className="text-lg font-semibold">{step.title}</p>
          <p className="text-sm text-muted">{step.why}</p>
        </div>
        {demo.shared ? (
          <p className="text-[0.95rem]">You are watching a shared sample case, so the buttons are off.</p>
        ) : (
          <StepAction key={`${step.id}:${demo.caseId}`} step={step} demo={demo} now={now} />
        )}
      </div>
    );
  }
  const who = step.person!;
  return (
    <>
      <div className="min-w-0 flex-[1_1_420px]">
        <p className="text-lg font-semibold">
          Next: {CAST[who].name} · {step.title.toLowerCase()}
        </p>
        <p className="text-sm text-muted">
          {stepCounter(step)}. {step.why}
        </p>
      </div>
      <Button
        variant="secondary"
        className="border-2 border-brand text-brand-strong"
        loading={busy === who}
        onClick={() => void become(who)}
      >
        Continue as {CAST[who].name}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-danger">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** A demo with nothing done, to draw the line before the demo starts. */
const EMPTY_DEMO: GuidedDemo = {
  caseId: "",
  reference: "",
  title: "",
  description: "",
  location: "",
  schoolName: "",
  status: "submitted",
  budget: null,
  escrow: null,
  escrowError: null,
  shared: false,
  template: {
    lines: [],
    amounts: [300_000, 200_000],
    claimNotes: ["", ""],
    reportNote: "",
    schoolDoneNote: "",
    challengeSeconds: 60,
  },
};

/** An example repair's case page: `/cases/:slug`. */
export function ExampleCaseScreen() {
  const { slug } = useParams<{ slug: string }>();
  const repair = exampleBySlug(slug);
  if (!repair) {
    return (
      <div className="page-wrap flex flex-col gap-4 py-16">
        <h1 className="text-3xl font-semibold">No such example</h1>
        <ButtonLink href="/demo" className="self-start">
          Follow the live repair
        </ButtonLink>
      </div>
    );
  }
  return (
    <CaseLayout
      school={repair.school}
      title={`${repair.title}. ${repair.story}`}
      photo={repair.photo}
      band={
        <>
          <div className="min-w-0 flex-[1_1_420px]">
            <p className="text-lg font-semibold">This is an example repair for the demo</p>
            <p className="text-sm text-muted">
              Nothing on this page ran on Solana. The toilets case at Thandolwethu Primary does: follow
              it to see every step and its transaction.
            </p>
          </div>
          <ButtonLink href="/demo" variant="secondary" className="border-2 border-brand text-brand-strong">
            Follow the live repair
          </ButtonLink>
        </>
      }
      line={exampleLine(repair)}
      people={[
        ["School", repair.school],
        ["Learners affected", String(repair.learners)],
      ]}
    />
  );
}
