"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FilePicker } from "@/components/file-picker";
import { Photo } from "@/components/media/photo";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { PageLoading } from "@/components/ui/page";
import { ApiError, getApi } from "@/data/api";
import { useAudience } from "@/data/audience";
import { useQuery } from "@/data/use-query";
import {
  ISSUE_CATEGORIES,
  type EvidenceUpload,
  type IssueCategory,
  type LearnerImpact,
} from "@/data/types";
import { demoActions, refreshGuided } from "@/features/demo/client";
import { useMessages } from "@/i18n";
import { DEMO_SCHOOL } from "./fixtures";
import { useLive } from "./live";

const INSTEAD = [
  "Queue for the ones that work",
  "Miss class time",
  "Go home early",
  "Stay away on some days",
  "Use a neighbour's",
];

const DANGER: { id: NonNullable<LearnerImpact["danger"]>; label: string }[] = [
  { id: "yes", label: "Yes" },
  { id: "unhealthy", label: "No, but it is unhealthy" },
  { id: "no", label: "No" },
];

/** The learner questions, as plain answers. Empty answers are left out. */
export function impactNote(impact: LearnerImpact): string {
  const parts: string[] = [];
  if (impact.learners) parts.push(`${impact.learners} learners cannot use it`);
  if (impact.since) parts.push(`since: ${impact.since}`);
  if (impact.instead?.length) parts.push(`instead they ${impact.instead.join(", ").toLowerCase()}`);
  if (impact.danger === "yes") parts.push("someone is in danger now");
  if (impact.danger === "unhealthy") parts.push("no one is in danger, but it is unhealthy");
  return parts.length ? `Learners: ${parts.join("; ")}.` : "";
}

function cleanImpact(impact: LearnerImpact): LearnerImpact | undefined {
  const out: LearnerImpact = {};
  if (impact.learners && impact.learners > 0) out.learners = Math.round(impact.learners);
  if (impact.since?.trim()) out.since = impact.since.trim();
  if (impact.instead?.length) out.instead = impact.instead;
  if (impact.danger) out.danger = impact.danger;
  return Object.keys(out).length ? out : undefined;
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-10 items-center rounded-full px-3.5 text-sm",
        on ? "border-2 border-brand bg-brand-soft font-semibold" : "border border-line-strong",
      )}
    >
      {children}
    </button>
  );
}

function ImpactFields({
  value,
  onChange,
}: {
  value: LearnerImpact;
  onChange: (next: LearnerImpact) => void;
}) {
  const instead = value.instead ?? [];
  return (
    <fieldset className="m-0 flex flex-col gap-3.5 border-0 p-0">
      <legend className="mb-2.5 text-xl font-bold tracking-[-0.02em]">
        How does this affect the learners?
      </legend>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-[1_1_220px] flex-col gap-2 font-semibold">
          How many learners can&apos;t use it?
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={value.learners ?? ""}
            onChange={(e) =>
              onChange({ ...value, learners: e.target.value ? Number(e.target.value) : undefined })
            }
            className="h-12 rounded-xl border border-line-strong px-3.5 font-normal"
          />
        </label>
        <label className="flex flex-[1_1_220px] flex-col gap-2 font-semibold">
          Since when?
          <input
            value={value.since ?? ""}
            maxLength={80}
            placeholder="About 3 weeks"
            onChange={(e) => onChange({ ...value, since: e.target.value })}
            className="h-12 rounded-xl border border-line-strong px-3.5 font-normal"
          />
        </label>
      </div>
      <div className="flex flex-col gap-2" role="group" aria-labelledby="instead-label">
        <span id="instead-label" className="font-semibold">
          What do learners do instead? Pick all that apply.
        </span>
        <div className="flex flex-wrap gap-2">
          {INSTEAD.map((option) => (
            <Chip
              key={option}
              on={instead.includes(option)}
              onClick={() =>
                onChange({
                  ...value,
                  instead: instead.includes(option)
                    ? instead.filter((o) => o !== option)
                    : [...instead, option],
                })
              }
            >
              {option}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2" role="group" aria-labelledby="danger-label">
        <span id="danger-label" className="font-semibold">
          Is anyone in danger right now?
        </span>
        <div className="flex flex-wrap gap-2">
          {DANGER.map((d) => (
            <Chip
              key={d.id}
              on={value.danger === d.id}
              onClick={() => onChange({ ...value, danger: value.danger === d.id ? undefined : d.id })}
            >
              {d.label}
            </Chip>
          ))}
        </div>
        {value.danger === "yes" ? (
          <p className="text-sm font-semibold text-danger">
            If someone could be hurt now, keep learners away and phone the district office too.
            This report does not replace that call.
          </p>
        ) : null}
      </div>
    </fieldset>
  );
}

/** The left rail: what happens next, and why the school names no price. */
function AfterRail() {
  const steps: [string, string][] = [
    ["You report it.", "A photo and one sentence is enough."],
    [
      "A contractor quotes.",
      "The price is checked against local shops. Only then does an amount appear on the case.",
    ],
    ["A funder locks the money.", "It sits on Solana, not with the school or us."],
    ["You get a say", "before each release, and confirm when the job is done."],
  ];
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.02em]">What happens after you send it</h2>
      <ol className="relative m-0 list-none p-0">
        {steps.map(([bold, rest], i) => (
          <li key={bold} className="relative grid grid-cols-[22px_minmax(0,1fr)] gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 ? (
              <span aria-hidden="true" className="absolute top-5 bottom-0 left-[9px] w-1 bg-line" />
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "relative size-[22px] rounded-full",
                i === 0 ? "bg-brand" : "border-4 border-line-strong bg-surface",
              )}
            />
            <span className="text-[0.95rem] leading-snug">
              <strong className="font-semibold">{bold}</strong> {rest}
            </span>
          </li>
        ))}
      </ol>
      <div className="rounded-[14px] bg-accent-soft px-4 py-3.5 text-sm leading-normal text-accent-strong">
        <strong className="font-semibold">Why you don&apos;t name a price.</strong> The school reports
        the problem, not the cost. A price comes from the quote and the supplier&apos;s receipt, and is
        public once a funder locks the money. That way nobody can pad a report.
      </div>
    </div>
  );
}

function Frame({ school, children }: { school: string; children: ReactNode }) {
  return (
    <>
      <section className="relative h-[120px] overflow-hidden bg-ink sm:h-[140px]">
        <Photo name="school_brick" alt="" priority shape="free" sizes="100vw" className="absolute inset-0 h-full w-full" />
        <div className="absolute bottom-4 left-4 rounded-[14px] bg-ink px-4 py-3 text-on-brand sm:left-6">
          <span className="text-xl font-bold tracking-[-0.03em] sm:text-2xl">{school}</span>
        </div>
      </section>
      <div className="flex flex-col lg:flex-row">
        <aside className="order-2 shrink-0 border-t border-line bg-surface lg:order-1 lg:w-[400px] lg:border-t-0 lg:border-r">
          <AfterRail />
        </aside>
        <section className="order-1 flex max-w-[820px] min-w-0 flex-1 flex-col gap-5 px-4 py-6 sm:px-8 lg:order-2 lg:px-10 lg:py-8">
          {children}
        </section>
      </div>
    </>
  );
}

/** `/report`: report a problem. No rand amount anywhere. */
export function ReportBench() {
  const audience = useAudience();
  const live = useLive();
  if (audience.status === "loading" || live.loading) return <PageLoading />;
  if (audience.role === "school_admin") return <SchoolReport />;
  if (audience.role && !audience.community) {
    return (
      <Frame school="Report a problem">
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">Reports come from the school community</h1>
        <p className="text-muted">
          You are signed in as staff. Sign out, or switch to Nomvula (the school) or the public, to
          report a problem.
        </p>
        <ButtonLink href="/sign-in" className="self-start">
          Switch person
        </ButtonLink>
      </Frame>
    );
  }
  return <CommunityReport />;
}

/** The school finishes the demo case's report: its note and the learner answers. */
function SchoolReport() {
  const router = useRouter();
  const { demo, step } = useLive();
  const [note, setNote] = useState(demo?.template.reportNote ?? "");
  const [impact, setImpact] = useState<LearnerImpact>(
    demo?.impact ?? { learners: 380, since: "About 3 weeks" },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!demo || !step || step.id !== "report") {
    return (
      <Frame school={DEMO_SCHOOL.name}>
        <h1 className="text-3xl font-semibold tracking-[-0.035em]">
          {demo ? "This report is already sent" : "No report to finish"}
        </h1>
        <p className="text-muted">
          {demo
            ? "The toilets report is on its way. See where it is on your school's page."
            : "Start the demo to get the toilets case at Thandolwethu Primary."}
        </p>
        <ButtonLink href={demo ? "/school" : "/sign-in"} className="self-start">
          {demo ? "Go to our school" : "Start the demo"}
        </ButtonLink>
      </Frame>
    );
  }

  async function send() {
    if (!demo) return;
    setBusy(true);
    setError(null);
    try {
      const extra = impactNote(cleanImpact(impact) ?? {});
      await demoActions.logProblem(demo.caseId, [note.trim(), extra].filter(Boolean).join(" "));
      await refreshGuided();
      router.push("/school");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Frame school={DEMO_SCHOOL.name}>
      <h1 className="text-[2rem] font-semibold tracking-[-0.035em] sm:text-[2.1rem]">What is broken?</h1>
      <div className="flex flex-col gap-2">
        <span className="font-semibold">Photos</span>
        <div className="grid grid-cols-3 gap-2.5">
          <figure className="m-0 flex flex-col gap-1.5">
            <Photo name="toilets_before" alt="The broken toilets" shape="free" sizes="240px" className="h-32 w-full rounded-xl sm:h-36" />
            <figcaption className="text-[0.8rem] text-muted">
              From the parent&apos;s report
              <span className="block text-faint">Example photo for the demo</span>
            </figcaption>
          </figure>
        </div>
      </div>
      <label className="flex flex-col gap-2 font-semibold">
        In one or two sentences
        <textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-xl border border-line-strong px-3.5 py-3 font-normal leading-normal"
        />
      </label>
      <ImpactFields value={impact} onChange={setImpact} />
      {error ? (
        <p role="alert" className="font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" loading={busy} disabled={!note.trim()} onClick={send}>
          Send the report
        </Button>
        <span className="text-sm text-muted">No price is set here.</span>
      </div>
    </Frame>
  );
}

/** Anyone in the school community reports a problem. */
function CommunityReport() {
  const m = useMessages();
  const router = useRouter();
  const preset = useSearchParams().get("school");
  const schools = useQuery("report-schools", () => getApi().searchSchools(""));
  const [schoolId, setSchoolId] = useState<string>("");
  const [category, setCategory] = useState<IssueCategory | "">("");
  const [text, setText] = useState("");
  const [evidence, setEvidence] = useState<EvidenceUpload[]>([]);
  const [impact, setImpact] = useState<LearnerImpact>({});
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = schools.data ?? [];
  const chosenId = schoolId || preset || "";
  const school = list.find((s) => s.id === chosenId || s.name === chosenId) ?? null;

  async function send() {
    if (!school) return setError("Choose the school.");
    if (!category) return setError("Choose what kind of problem it is.");
    if (text.trim().length < 3) return setError("Say what is broken in a sentence.");
    setBusy(true);
    setError(null);
    const description = text.trim();
    const title = (description.split(/(?<=[.!?])\s/)[0] ?? description).slice(0, 140);
    try {
      const receipt = await getApi().submitReport({
        schoolId: school.id,
        category,
        title: title.length >= 3 ? title : description.slice(0, 140),
        description,
        location: "",
        anonymous,
        evidence,
        impact: cleanImpact(impact),
      });
      router.push(`/receipts/${receipt.reference}`);
    } catch (caught) {
      const refused =
        caught instanceof ApiError &&
        (caught.code === "unauthenticated" || caught.code === "forbidden");
      setError(
        refused
          ? "This account cannot report a problem. Sign out and try again."
          : "The report was not sent. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <Frame school={school?.name ?? "Report a problem"}>
      <h1 className="text-[2rem] font-semibold tracking-[-0.035em] sm:text-[2.1rem]">What is broken?</h1>
      <label className="flex flex-col gap-2 font-semibold">
        Which school?
        <select
          value={school?.id ?? ""}
          onChange={(e) => setSchoolId(e.target.value)}
          className="h-12 rounded-xl border border-line-strong bg-surface px-3 font-normal"
        >
          <option value="">{schools.loading ? "Loading schools…" : "Choose a school"}</option>
          {list.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}, {s.town}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-2" role="group" aria-labelledby="kind-label">
        <span id="kind-label" className="font-semibold">
          What kind of problem?
        </span>
        <div className="flex flex-wrap gap-2">
          {ISSUE_CATEGORIES.map((c) => (
            <Chip key={c} on={category === c} onClick={() => setCategory(c)}>
              {m.category[c]}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-semibold">Photos</span>
        <FilePicker value={evidence} onChange={setEvidence} />
      </div>
      <label className="flex flex-col gap-2 font-semibold">
        In one or two sentences
        <textarea
          rows={3}
          value={text}
          maxLength={5000}
          placeholder="Two of the four girls' toilets leak and cannot be flushed."
          onChange={(e) => setText(e.target.value)}
          className="rounded-xl border border-line-strong px-3.5 py-3 font-normal leading-normal"
        />
      </label>
      <ImpactFields value={impact} onChange={setImpact} />
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="size-5 accent-[var(--color-brand)]"
        />
        Leave my name off the report
      </label>
      {error ? (
        <p role="alert" className="font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" loading={busy} onClick={send}>
          Send the report
        </Button>
        <span className="text-sm text-muted">No price is set here.</span>
      </div>
    </Frame>
  );
}
