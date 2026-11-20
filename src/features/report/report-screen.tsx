"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BuddyHint } from "@/components/buddy/buddy-hint";
import { CategoryGlyph } from "@/components/community/picture";
import { FilePicker } from "@/components/file-picker";
import { IssueCard } from "@/components/issue-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Container, EmptyState, Loading, Notice } from "@/components/ui/page";
import { Stepper } from "@/components/ui/stepper";
import { ApiError, getApi } from "@/data/api";
import { useSession } from "@/data/session";
import {
  ISSUE_CATEGORIES,
  type EvidenceUpload,
  type IssueCategory,
  type School,
} from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import { formatBytes } from "@/lib/format";
import { ParticipationBadge } from "../schools/school-bits";
import {
  clearDraft,
  forgetInitialDraft,
  saveDraft,
  useInitialDraft,
} from "./draft-store";

interface Draft {
  /** `undefined` until the person chooses or clears a school; then the link preset no longer applies. */
  school: School | null | undefined;
  category: IssueCategory | "";
  title: string;
  location: string;
  description: string;
  evidence: EvidenceUpload[];
  anonymous: boolean;
}

/**
 * One question per screen: school, type of problem, what is wrong, duplicate
 * check, photo, review. Each screen has one thing to answer and one button.
 */
const SCREEN = {
  school: 0,
  category: 1,
  describe: 2,
  duplicate: 3,
  evidence: 4,
  review: 5,
};
const LAST_SCREEN = SCREEN.review;
/** What the Bona buddy helps with on each screen. */
const HINT_OF_SCREEN = [
  "report.school",
  "report.category",
  "report.describe",
  "report.describe",
  "report.photo",
  "report.review",
] as const;
/** Which of the four stops each screen belongs to. Type, wording and the duplicate check are all "What". */
const STOP_OF_SCREEN = [0, 1, 1, 1, 2, 3];

const isCategory = (value: string | null): value is IssueCategory =>
  ISSUE_CATEGORIES.includes(value as IssueCategory);

export function ReportScreen() {
  const m = useMessages();
  const r = m.report;
  const router = useRouter();
  const params = useSearchParams();
  const presetSchool = params.get("school");
  const presetCategory = params.get("category");
  const presetText = params.get("text");
  const { session } = useSession();

  // What was typed before is brought back, unless the link already says what to report.
  const stored = useInitialDraft();
  const restoring = stored !== null && !presetText;
  useEffect(() => forgetInitialDraft, []);

  const opening: Draft = {
    school: restoring && !presetSchool ? stored.school : undefined,
    category: isCategory(presetCategory)
      ? presetCategory
      : restoring
        ? stored.category
        : "",
    title: restoring ? stored.title : (presetText ?? "").slice(0, 140),
    location: restoring ? stored.location : "",
    description: restoring ? stored.description : "",
    evidence: [],
    anonymous: restoring ? stored.anonymous : false,
  };

  // Null until the person changes something; until then the opening values show.
  const [edited, setEdited] = useState<Draft | null>(null);
  const draft = edited ?? opening;
  const update = (patch: Partial<Draft>) => setEdited({ ...draft, ...patch });

  const [screenState, setScreenState] = useState<number | null>(null);
  const screen = screenState ?? (restoring ? Math.min(stored.screen, 1) : 0);
  const setScreen = (next: number | ((current: number) => number)) =>
    setScreenState(typeof next === "function" ? next(screen) : next);

  const [errors, setErrors] = useState<{ category?: string; title?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<"failed" | "refused" | null>(null);
  /** How many similar reports the duplicate check found; null while it is still looking. */
  const [similar, setSimilar] = useState<number | null>(null);

  // A school passed in the link (from a school page or Bona AI) is pre-selected.
  const preset = useQuery(`preset-school:${presetSchool}`, async () =>
    presetSchool ? getApi().getSchool(presetSchool) : null,
  );
  const school = draft.school === undefined ? (preset.data ?? null) : draft.school;

  // Keep the typing on this phone once the person has changed something.
  useEffect(() => {
    if (!edited) return;
    const { title, location, description, category, anonymous } = edited;
    if (!title && !location && !description && !category) return clearDraft();
    saveDraft({
      school: school ?? null,
      category,
      title,
      location,
      description,
      anonymous,
      screen,
    });
  }, [edited, school, screen]);

  function startAgain() {
    clearDraft();
    setEdited({
      school: null,
      category: "",
      title: "",
      location: "",
      description: "",
      evidence: [],
      anonymous: false,
    });
    setScreen(0);
  }

  // Move focus to the heading so screen readers announce each new screen.
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else heading.current?.focus();
  }, [screen]);

  function next() {
    if (screen === SCREEN.category) {
      const category = draft.category ? undefined : r.describe.categoryMissing;
      setErrors({ category });
      if (category) return;
    }
    if (screen === SCREEN.describe) {
      const title = draft.title.trim().length >= 3 ? undefined : r.describe.titleTooShort;
      setErrors({ title });
      if (title) return;
    }
    setScreen((s) => Math.min(s + 1, LAST_SCREEN));
  }

  async function submit() {
    if (!school || !draft.category) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const receipt = await getApi().submitReport({
        schoolId: school.id,
        category: draft.category,
        title: draft.title,
        description: draft.description.trim() || draft.title,
        location: draft.location,
        anonymous: draft.anonymous,
        evidence: draft.evidence,
      });
      clearDraft();
      router.push(`/receipts/${receipt.reference}`);
    } catch (caught) {
      const refused =
        caught instanceof ApiError &&
        (caught.code === "unauthenticated" || caught.code === "forbidden");
      setSubmitError(refused ? "refused" : "failed");
      setSubmitting(false);
    }
  }

  const titles = [
    r.school.title,
    r.describe.categoryTitle,
    r.describe.title,
    r.duplicate.title,
    r.evidence.title,
    r.review.title,
  ];
  const stop = STOP_OF_SCREEN[screen];

  const primaryClass = "min-h-13 w-full text-lg lg:w-auto";
  let body: ReactNode;
  let primary: ReactNode = (
    <Button onClick={next} className={primaryClass}>
      {m.common.continue}
      <Icon name="arrowRight" />
    </Button>
  );

  if (screen === 0) {
    body = (
      <SchoolStep school={school} onChoose={(chosen) => update({ school: chosen })} />
    );
    if (!school) primary = null;
  } else if (screen === SCREEN.category) {
    body = (
      <fieldset>
        <legend className="sr-only">{r.describe.category}</legend>
        <div className="grid grid-cols-2 gap-3">
          {ISSUE_CATEGORIES.map((category) => {
            const chosen = draft.category === category;
            return (
              <label
                key={category}
                htmlFor={`category-${category}`}
                className={cn(
                  "relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 px-2 py-3 text-center text-lg leading-tight font-semibold has-focus-visible:outline-3 has-focus-visible:outline-brand",
                  chosen
                    ? "border-brand bg-brand-soft text-brand-strong"
                    : "border-line-strong bg-surface",
                )}
              >
                <input
                  id={`category-${category}`}
                  type="radio"
                  name="category"
                  value={category}
                  checked={chosen}
                  onChange={() => {
                    update({ category });
                    setErrors({});
                  }}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex size-12 items-center justify-center rounded-full",
                    chosen ? "bg-brand text-on-brand" : "bg-brand-soft text-brand-strong",
                  )}
                >
                  <CategoryGlyph category={category} className="size-7" />
                </span>
                <span>{m.category[category]}</span>
                {chosen ? (
                  <Icon name="check" className="absolute top-2 right-2 size-5" />
                ) : null}
              </label>
            );
          })}
        </div>
        {errors.category ? (
          <p role="alert" className="mt-2 font-semibold text-danger">
            {errors.category}
          </p>
        ) : null}
      </fieldset>
    );
  } else if (screen === SCREEN.describe) {
    body = (
      <div className="flex flex-col gap-4">
        <Field
          id="report-title"
          label={r.describe.titleLabel}
          hint={r.describe.titleHint}
          error={errors.title}
        >
          <Input
            id="report-title"
            value={draft.title}
            maxLength={140}
            aria-describedby="report-title-hint"
            aria-invalid={Boolean(errors.title)}
            onChange={(event) => update({ title: event.target.value })}
            className="min-h-14 text-lg"
          />
        </Field>
        <details
          open={Boolean(draft.location || draft.description) || undefined}
          className="rounded-2xl border border-line bg-surface px-4 py-1"
        >
          <summary className="flex min-h-12 cursor-pointer items-center font-semibold">
            {r.describe.more}
          </summary>
          <div className="flex flex-col gap-4 pb-4">
            <Field
              id="report-where"
              label={`${r.describe.whereLabel} (${m.common.optional})`}
              hint={r.describe.whereHint}
            >
              <Input
                id="report-where"
                value={draft.location}
                maxLength={120}
                aria-describedby="report-where-hint"
                onChange={(event) => update({ location: event.target.value })}
              />
            </Field>
            <Field
              id="report-details"
              label={`${r.describe.detailsLabel} (${m.common.optional})`}
              hint={r.describe.detailsHint}
            >
              <Textarea
                id="report-details"
                value={draft.description}
                maxLength={5000}
                aria-describedby="report-details-hint"
                onChange={(event) => update({ description: event.target.value })}
              />
            </Field>
          </div>
        </details>
      </div>
    );
  } else if (screen === SCREEN.duplicate) {
    body = (
      <DuplicateStep
        schoolId={school!.id}
        text={`${draft.title} ${draft.description} ${draft.location}`}
        onCount={setSimilar}
        onSame={(issueId) => {
          clearDraft();
          router.push(`/issues/${issueId}`);
        }}
      />
    );
    // "Mine is different" only makes sense when there is something to differ from.
    primary =
      similar === null ? null : (
        <Button onClick={next} className={primaryClass}>
          {similar === 0 ? m.common.continue : r.duplicate.different}
          <Icon name="arrowRight" />
        </Button>
      );
  } else if (screen === SCREEN.evidence) {
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-muted">{r.evidence.help}</p>
        <FilePicker
          value={draft.evidence}
          onChange={(evidence) => update({ evidence })}
        />
      </div>
    );
    if (draft.evidence.length === 0) {
      primary = (
        <Button onClick={next} variant="secondary" className={primaryClass}>
          {r.evidence.skip}
        </Button>
      );
    }
  } else {
    const rows: { label: string; value: ReactNode; editScreen: number }[] = [
      { label: r.review.school, value: school?.name, editScreen: SCREEN.school },
      {
        label: r.review.type,
        value: draft.category ? m.category[draft.category] : null,
        editScreen: SCREEN.category,
      },
      { label: r.review.problem, value: draft.title, editScreen: SCREEN.describe },
      // Optional answers appear only when they were given: fewer rows to read.
      ...(draft.location
        ? [{ label: r.review.where, value: draft.location, editScreen: SCREEN.describe }]
        : []),
      ...(draft.description
        ? [
            {
              label: r.review.details,
              value: draft.description,
              editScreen: SCREEN.describe,
            },
          ]
        : []),
      {
        label: r.review.evidence,
        value:
          draft.evidence.length === 0
            ? r.review.noEvidence
            : draft.evidence
                .map((upload) => `${upload.file.name} (${formatBytes(upload.file.size)})`)
                .join(", "),
        editScreen: SCREEN.evidence,
      },
    ];
    body = (
      <div className="flex flex-col gap-5">
        <dl className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <dt className="text-sm text-muted">{row.label}</dt>
                <dd className="font-semibold break-words">{row.value}</dd>
              </div>
              <button
                type="button"
                onClick={() => setScreen(row.editScreen)}
                aria-label={`${r.review.edit}: ${row.label}`}
                className="-my-2 inline-flex min-h-11 shrink-0 items-center px-2 font-semibold text-brand-strong underline underline-offset-4"
              >
                {r.review.edit}
              </button>
            </div>
          ))}
        </dl>
        <Checkbox
          id="report-anonymous"
          label={r.review.anonymous}
          hint={r.review.anonymousHelp}
          checked={draft.anonymous}
          onChange={(event) => update({ anonymous: event.target.checked })}
          className="rounded-2xl border border-line bg-surface px-4 py-2"
        />
        {session ? (
          <p className="flex items-center gap-2 text-sm font-semibold text-muted">
            <Icon name="user" className="size-4" />
            {r.review.signedInAs(session.user.displayName)}
          </p>
        ) : null}
        <p className="text-sm text-muted">{r.review.consent}</p>
        <p className="flex items-start gap-2 text-sm font-semibold">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-danger" />
          {r.review.danger}
        </p>
        {submitError ? (
          <Notice tone="danger" icon="alert">
            <p role="alert">
              {submitError === "refused" ? r.refused : m.common.actionError}
            </p>
          </Notice>
        ) : null}
      </div>
    );
    primary = (
      <Button onClick={submit} disabled={submitting} className={primaryClass}>
        {submitting ? r.review.submitting : r.review.submit}
      </Button>
    );
  }

  return (
    <Container size="narrow" className="pb-32 lg:pb-10">
      <BuddyHint id={HINT_OF_SCREEN[screen]} />
      <div className="flex min-h-11 items-center justify-between gap-3">
        {screen > 0 ? (
          <button
            type="button"
            onClick={() => setScreen((s) => s - 1)}
            disabled={submitting}
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold text-brand-strong hover:bg-brand-soft disabled:opacity-50"
          >
            <Icon name="arrowLeft" className="size-4" />
            {m.common.back}
          </button>
        ) : (
          <p className="font-semibold text-brand">{r.title}</p>
        )}
        <p className="inline-flex items-center gap-1 text-sm text-muted">
          <Icon name="check" className="size-4" />
          {r.noAccount}
        </p>
      </div>

      <Stepper steps={r.stepper} current={stop} label={r.stepperLabel} className="mt-2" />
      <h1
        ref={heading}
        tabIndex={-1}
        className="mt-4 text-3xl font-bold tracking-tight outline-none"
      >
        {titles[screen]}
      </h1>

      {restoring && screen <= SCREEN.category ? (
        <Notice tone="info" icon="info" className="mt-4">
          <p>{r.draftKept}</p>
          <Button variant="quiet" size="sm" onClick={startAgain} className="mt-1 px-0">
            {r.startAgain}
          </Button>
        </Notice>
      ) : null}

      <div className="mt-5">
        {screen === 0 && presetSchool && preset.loading ? <Loading lines={1} /> : body}
      </div>

      {/* One button, always in reach of the thumb: pinned above the phone menu. */}
      {primary ? (
        <div
          data-testid="report-action"
          className="no-print fixed inset-x-0 bottom-[calc(var(--spacing-bottom-bar)+env(safe-area-inset-bottom,0px))] z-20 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
        >
          <div className="mx-auto flex max-w-2xl justify-end">{primary}</div>
        </div>
      ) : null}
    </Container>
  );
}

function SchoolStep({
  school,
  onChoose,
}: {
  school: School | null;
  onChoose: (school: School | null) => void;
}) {
  const m = useMessages();
  const r = m.report.school;
  const [text, setText] = useState("");
  const query = useQuery(`report-schools:${text}`, () => getApi().searchSchools(text));

  if (school) {
    return (
      <div className="rounded-2xl border-2 border-brand bg-brand-soft p-5">
        <p className="text-sm font-semibold text-brand-strong">{r.chosen}</p>
        <p className="mt-1 text-xl font-bold">{school.name}</p>
        <p className="text-muted">
          {school.town}, {school.province}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <ParticipationBadge school={school} />
          <Button
            variant="quiet"
            size="sm"
            onClick={() => onChoose(null)}
            className="px-0"
          >
            {r.change}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field id="report-school" label={m.landing.searchLabel} hint={r.help}>
        <Input
          id="report-school"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={m.landing.searchPlaceholder}
          aria-describedby="report-school-hint"
          autoComplete="off"
          className="min-h-14 text-lg"
        />
      </Field>
      {!query.data ? (
        <Loading lines={2} />
      ) : query.data.length === 0 ? (
        <EmptyState>{r.none}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {query.data.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onChoose(option)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 text-left hover:border-brand"
              >
                <span>
                  <span className="block text-lg font-semibold">{option.name}</span>
                  <span className="text-muted">
                    {option.town}, {option.province}
                  </span>
                </span>
                <Icon name="arrowRight" className="size-5 shrink-0 text-brand" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DuplicateStep({
  schoolId,
  text,
  onSame,
  onCount,
}: {
  schoolId: string;
  text: string;
  onSame: (issueId: string) => void;
  /** Told how many similar reports were found, once the search has answered. */
  onCount: (count: number | null) => void;
}) {
  const m = useMessages();
  const r = m.report.duplicate;
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery(`similar:${schoolId}:${text}`, () =>
    getApi().findSimilarIssues({ schoolId, text }),
  );

  const count = query.data ? query.data.length : null;
  useEffect(() => {
    onCount(count);
    return () => onCount(null);
  }, [count, onCount]);

  async function same(issueId: string) {
    setBusy(issueId);
    try {
      await getApi().setEndorsement(issueId, true);
    } finally {
      onSame(issueId);
    }
  }

  if (!query.data) return <Loading lines={2} />;
  if (query.data.length === 0) {
    return (
      <Notice tone="success" icon="check">
        <p data-testid="no-duplicates">{r.none}</p>
      </Notice>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted">{r.found}</p>
      <ul className="flex flex-col gap-3">
        {query.data.map((issue) => (
          <li key={issue.id} data-testid="duplicate-suggestion">
            <IssueCard
              issue={issue}
              showSchool={false}
              footer={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Icon name="users" className="size-5 text-muted" />
                    {m.endorse.count(issue.endorsements)}
                  </span>
                  <Button
                    onClick={() => same(issue.id)}
                    disabled={busy !== null}
                    className="w-full sm:w-auto"
                  >
                    <Icon name="hand" />
                    {r.same}
                  </Button>
                </div>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
