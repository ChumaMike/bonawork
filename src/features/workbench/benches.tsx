"use client";

import { useMemo, useState, type ReactNode } from "react";
import { photoOr } from "@/components/media/manifest";
import { Photo } from "@/components/media/photo";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { PageLoading } from "@/components/ui/page";
import type { GuidedDemo } from "@/features/demo/client";
import type { DemoPerson, StepInfo } from "@/features/demo/steps";
import {
  Bench,
  CaseRail,
  CaseSummary,
  CaseTabs,
  RailList,
  RailRow,
} from "./bench";
import {
  DEMO_SCHOOL,
  EXAMPLE_REPAIRS,
  exampleStatus,
  exampleTotal,
  type ExampleRepair,
} from "./fixtures";
import { StartHere, useLive } from "./live";
import { guidedLine, liveStatus, rand } from "./model";
import { ContractorTask, FunderLock, LockPanel, ReviewerTask, SchoolTask } from "./tasks";

const EXAMPLE_NOTE = "Example repairs for the demo. Only the toilets case runs on Solana.";

/** Loading, switched off, or no case yet: the same three answers on every bench. */
function useBenchGate(person: DemoPerson) {
  const live = useLive();
  let gate: ReactNode = null;
  if (live.loading) gate = <PageLoading />;
  else if (live.guided.status === "off")
    gate = (
      <p className="page-wrap py-16 text-lg">The guided demo is switched off on this server.</p>
    );
  else if (live.guided.status === "error")
    gate = <p className="page-wrap py-16 text-lg">{live.guided.message}</p>;
  else if (!live.demo || !live.step)
    gate = (
      <div className="page-wrap py-12">
        <StartHere person={person} />
      </div>
    );
  return { ...live, gate };
}

// ------------------------------------------------------------------ school

export function SchoolBench() {
  const { demo, step, now, gate } = useBenchGate("school");
  if (gate || !demo || !step) return gate;
  return <SchoolBenchView demo={demo} step={step} now={now} />;
}

function SchoolBenchView({ demo, step, now }: { demo: GuidedDemo; step: StepInfo; now: number }) {
  const ours = EXAMPLE_REPAIRS.filter((r) => r.school === DEMO_SCHOOL.name);
  const live = liveStatus(step, "school");
  const tones = [live.tone, ...ours.map((r) => exampleStatus(r).tone)];
  const counts = {
    need: tones.filter((t) => t === "need").length,
    fixing: tones.filter((t) => t === "muted" || t === "stopped").length,
    fixed: tones.filter((t) => t === "done").length,
  };
  return (
    <>
      <section className="relative h-[240px] overflow-hidden bg-ink sm:h-[280px]">
        <Photo
          name="school_brick"
          alt="Thandolwethu Primary: the brick classroom blocks and the yard"
          priority
          shape="free"
          sizes="100vw"
          className="absolute inset-0 h-full w-full"
          imageClassName="object-[center_60%]"
        />
        <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3 sm:inset-x-6 sm:bottom-6">
          <div className="flex max-w-xl flex-col gap-1.5 rounded-2xl bg-ink px-5 py-4 text-on-brand">
            <h1 className="text-[1.75rem] leading-none font-bold tracking-[-0.04em] sm:text-4xl">
              {DEMO_SCHOOL.name}
            </h1>
            <span className="text-[0.95rem] text-sun">
              {DEMO_SCHOOL.town}. {DEMO_SCHOOL.learners} learners.
            </span>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="school-counts">
            <Count n={counts.need} label="need you" />
            <Count n={counts.fixing} label="being fixed" />
            <Count n={counts.fixed} label="fixed and checked" green />
          </div>
        </div>
      </section>
      <Bench
        rail={
          <div className="flex flex-col py-5">
            <div className="flex items-center justify-between px-4 pb-3 sm:px-6">
              <h2 className="text-lg font-semibold">Our problems</h2>
              <ButtonLink href="/report" size="sm">
                Report one
              </ButtonLink>
            </div>
            <RailRow
              href="/school"
              selected
              photo="category_sanitation"
              title="Two toilets leak"
              status={live}
            />
            {ours.map((r) => (
              <RailRow
                key={r.slug}
                href={`/cases/${r.slug}`}
                photo={r.photo}
                done={r.stage === "fixed"}
                title={r.title}
                status={exampleStatus(r)}
              />
            ))}
            <div className="flex flex-col gap-2.5 px-4 pt-4 sm:px-6">
              <h2 className="text-base font-semibold">Fixed here before</h2>
              <div className="grid grid-cols-2 gap-1.5">
                <figure className="m-0 flex flex-col gap-1">
                  <Photo name="category_buildings" alt="A broken classroom ceiling, before" shape="free" sizes="180px" className="h-24 w-full rounded-lg" />
                  <figcaption className="text-xs font-semibold text-danger">Before, 12 Oct</figcaption>
                </figure>
                <figure className="m-0 flex flex-col gap-1">
                  <Photo
                    name={photoOr("ceiling_after", "reviewer_check")}
                    alt="The classroom ceiling after the repair"
                    shape="free"
                    sizes="180px"
                    className="h-24 w-full rounded-lg"
                  />
                  <figcaption className="text-xs font-semibold text-st-verified">After, checked 3 Nov</figcaption>
                </figure>
              </div>
              <span className="text-xs text-faint">Example photos for the demo.</span>
              <p className="pt-2 text-xs text-faint">{EXAMPLE_NOTE}</p>
            </div>
          </div>
        }
      >
        <CaseTabs demo={demo} line={guidedLine(demo, now)} task={<SchoolTask demo={demo} step={step} now={now} />} />
      </Bench>
    </>
  );
}

function Count({ n, label, green = false }: { n: number; label: string; green?: boolean }) {
  return (
    <span className="rounded-xl bg-surface px-3.5 py-2.5 text-sm">
      <strong className={cn("block text-[1.375rem] tracking-[-0.02em]", green && "text-st-verified")}>
        {n}
      </strong>
      {label}
    </span>
  );
}

// ------------------------------------------------------------------ funder

type Filter = "all" | "danger" | "water" | "small";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "danger", label: "Danger first" },
  { id: "water", label: "Water and toilets" },
  { id: "small", label: "Under R3 000" },
];

type FundRow =
  | { kind: "live" }
  | { kind: "example"; repair: ExampleRepair };

export function FunderBench() {
  const { demo, step, now, gate } = useBenchGate("funder");
  if (gate || !demo || !step) return gate;
  return <FunderBenchView demo={demo} step={step} now={now} />;
}

function FunderBenchView({ demo, step, now }: { demo: GuidedDemo; step: StepInfo; now: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [chosen, setChosen] = useState<string>("live");
  const open = EXAMPLE_REPAIRS.filter((r) => r.stage === "needs_funder");
  const funded = EXAMPLE_REPAIRS.filter((r) => r.fundedByNaledi);
  const total = demo.template.amounts[0] + demo.template.amounts[1];

  const rows: FundRow[] = useMemo(() => {
    const all: FundRow[] = [{ kind: "live" }, ...open.map((repair) => ({ kind: "example" as const, repair }))];
    const amount = (r: FundRow) => (r.kind === "live" ? total : (exampleTotal(r.repair) ?? 0));
    const danger = (r: FundRow) => r.kind === "live" || r.repair.tag?.tone === "danger";
    const water = (r: FundRow) =>
      r.kind === "live" || r.repair.category === "water" || r.repair.category === "sanitation";
    if (filter === "danger") return [...all.filter(danger), ...all.filter((r) => !danger(r))];
    if (filter === "water") return all.filter(water);
    if (filter === "small") return all.filter((r) => amount(r) < 300_000);
    return all;
  }, [filter, open, total]);

  const example = chosen === "live" ? null : (open.find((r) => r.slug === chosen) ?? null);

  return (
    <Bench
      rail={
        <div className="flex flex-col py-5">
          <div className="flex flex-col gap-2.5 px-4 pb-3.5 sm:px-6">
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.02em]">Vaal Ridge repair fund</h1>
              <p className="text-sm text-muted">
                Sandbox rand. The toilets case is live on Solana devnet; the rest are examples.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "flex min-h-9 items-center rounded-full px-3 text-[0.8rem]",
                    filter === f.id ? "bg-ink font-semibold text-on-brand" : "border border-line-strong",
                  )}
                >
                  {f.id === "all" ? `All ${open.length + 1}` : f.label}
                </button>
              ))}
            </div>
          </div>
          {rows.map((row) =>
            row.kind === "live" ? (
              <RailRow
                key="live"
                onClick={() => setChosen("live")}
                selected={chosen === "live"}
                photo="category_sanitation"
                title="Two toilets leak"
                sub={`${demo.schoolName}, ${demo.impact?.learners ?? 380} learners`}
                tag={{ text: "Danger to health", tone: "danger" }}
                status={liveStatus(step, "funder")}
                amount={rand(total)}
              />
            ) : (
              <RailRow
                key={row.repair.slug}
                onClick={() => setChosen(row.repair.slug)}
                selected={chosen === row.repair.slug}
                photo={row.repair.photo}
                title={row.repair.title}
                sub={`${row.repair.school}, ${row.repair.learners} learners`}
                tag={row.repair.tag}
                amount={rand(exampleTotal(row.repair) ?? 0)}
              />
            ),
          )}
          <div className="px-4 pt-4 sm:px-6" id="money">
            <RailList
              title="Repairs you funded"
              note={EXAMPLE_NOTE}
              rows={[
                ...(demo.escrow?.funded
                  ? [{ label: "Toilets, Thandolwethu", status: liveStatus(step, "funder").text, tone: liveStatus(step, "funder").tone, href: "/demo" }]
                  : []),
                ...funded.map((r) => ({
                  label: `${r.title.split(",")[0].replace(/^Broken /, "")}, ${r.schoolShort.split(" ")[0]}`,
                  status:
                    r.stage === "fixed"
                      ? "Fixed and checked"
                      : r.stage === "objected"
                        ? "School objected"
                        : "Waiting for Check 2",
                  tone: (r.stage === "fixed" ? "done" : r.stage === "objected" ? "stopped" : "muted") as "done" | "stopped" | "muted",
                  href: `/cases/${r.slug}`,
                })),
              ]}
            />
          </div>
        </div>
      }
    >
      {example ? (
        <ExampleFund repair={example} />
      ) : (
        <CaseTabs
          demo={demo}
          line={guidedLine(demo, now)}
          task={
            <>
              <Photo
                name="category_sanitation"
                alt="The toilet block at Thandolwethu Primary"
                shape="free"
                sizes="(min-width: 1024px) 300px, 100vw"
                className="h-48 w-full rounded-[14px] sm:w-[300px]"
              />
              <FunderLock demo={demo} step={step} />
            </>
          }
        />
      )}
    </Bench>
  );
}

function ExampleFund({ repair }: { repair: ExampleRepair }) {
  const split = repair.split ?? [0, 0];
  return (
    <div className="flex flex-col gap-5 pt-1">
      <Photo
        name={repair.photo}
        alt={repair.title}
        shape="free"
        sizes="(min-width: 1024px) 300px, 100vw"
        className="h-48 w-full rounded-[14px] sm:w-[300px]"
      />
      <p className="text-sm text-muted">
        {repair.school} · {repair.learners} learners
      </p>
      <LockPanel
        title={`Lock ${rand(split[0] + split[1])}: ${repair.title.toLowerCase()}`}
        split={split}
        note={repair.story}
        payees={["the supplier", "the contractor"]}
      />
      <div className="rounded-[14px] bg-brand-soft px-4 py-4 text-[0.95rem]">
        This is an example repair for the demo, so it cannot be locked here. Only the toilets case
        runs on Solana devnet.
      </div>
      <ButtonLink href={`/cases/${repair.slug}`} variant="secondary" className="self-start">
        See its case page
      </ButtonLink>
    </div>
  );
}

// -------------------------------------------------------------- contractor

export function ContractorBench() {
  const { demo, step, now, gate } = useBenchGate("contractor");
  if (gate || !demo || !step) return gate;
  const lit: [boolean, boolean] = [step.id === "claim1", step.id === "claim2"];
  const others = EXAMPLE_REPAIRS.filter((r) => r.themba);
  return (
    <Bench
      summary={<CaseSummary demo={demo} lit={lit} />}
      rail={
        <CaseRail demo={demo} me="contractor" lit={lit}>
          <RailList
            title="Your other jobs"
            note={EXAMPLE_NOTE}
            rows={others.map((r) => ({
              label: `${r.title.replace(/^Broken /, "").replace(/ over the Grade 4 class/, "")}, ${r.schoolShort}`,
              status: r.contractorNote ?? exampleStatus(r).text,
              tone: r.stage === "fixed" ? "done" : r.contractorNote?.startsWith("Ask") ? "need" : "muted",
              href: `/cases/${r.slug}`,
            }))}
          />
        </CaseRail>
      }
    >
      <CaseTabs demo={demo} line={guidedLine(demo, now)} task={<ContractorTask demo={demo} step={step} />} />
    </Bench>
  );
}

// ---------------------------------------------------------------- reviewer

export function ReviewerBench() {
  const { demo, step, now, gate } = useBenchGate("reviewer");
  if (gate || !demo || !step) return gate;
  const lit: [boolean, boolean] = [step.id === "review1", step.id === "review2"];
  const others = EXAMPLE_REPAIRS.filter((r) => r.sipho);
  return (
    <Bench
      summary={<CaseSummary demo={demo} lit={lit} />}
      rail={
        <CaseRail demo={demo} me="reviewer" lit={lit}>
          <RailList
            title="Other checks waiting for you"
            note={EXAMPLE_NOTE}
            rows={others.map((r) => ({
              label: `${r.title.replace(/^Broken /, "").replace(/ over the Grade 4 class/, "")}, ${r.schoolShort}`,
              status: r.sipho ?? "",
              tone: r.stage === "objected" ? "stopped" : "muted",
              href: `/cases/${r.slug}`,
            }))}
          />
        </CaseRail>
      }
    >
      <CaseTabs demo={demo} line={guidedLine(demo, now)} task={<ReviewerTask demo={demo} step={step} />} />
    </Bench>
  );
}

/** Used by the bench pages' metadata and tests. */
export const BENCH_TITLE: Record<Exclude<DemoPerson, "public">, string> = {
  school: "Our school",
  funder: "Repairs to fund",
  contractor: "My jobs",
  reviewer: "My checks",
};
