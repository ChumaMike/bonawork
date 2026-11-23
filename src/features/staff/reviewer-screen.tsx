"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { BuddyHint } from "@/components/buddy/buddy-hint";
import { EvidenceList } from "@/components/evidence-list";
import { FilePicker } from "@/components/file-picker";
import { EvidenceThumb } from "@/components/staff/evidence-thumb";
import { BackButton, focusHere, Quote, showInUrl } from "@/components/staff/flow";
import { QueueGroup } from "@/components/staff/queue-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { describedBy, Field, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import {
  Container,
  LoadError,
  Loading,
  Notice,
  PageHero,
  PageShell,
} from "@/components/ui/page";
import { StatusPill } from "@/components/ui/status-pill";
import { getApi } from "@/data/api";
import type { EvidencePurpose, EvidenceUpload, Issue, LedgerRecord } from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import { formatDate, timeAgo } from "@/lib/format";
import { RequireRole } from "../auth/require-role";
import { StaffCaseTrail } from "../procurement/tasks";
import { lastEvent } from "./queue";
import { allAnswered, checksLine, composeReviewNote } from "./review-note";

/** Avalanche C-Chain and the Fuji test network. Anything else is a sample. */
const AVALANCHE_CHAINS = new Set(["eip155:43114", "eip155:43113"]);

function isSampleRecord(record: LedgerRecord | undefined): boolean {
  if (!record || record.source !== "ledger") return true;
  return !AVALANCHE_CHAINS.has(record.receipt.chainId);
}

/** The two steps of one review: the checks at the school, then the decision. */
type Step = "checks" | "decide";
/** What a reviewer can decide. Only "verified" ever makes a repair count. */
type Decision = "verified" | "disputed";

const quietLink =
  "inline-flex min-h-11 items-center gap-1.5 font-medium text-brand-strong underline-offset-4 hover:underline";

/** A demo shortcut and its note: set apart on a soft panel. */
const shortcutBox = "flex flex-col gap-2 rounded-2xl bg-sunken px-4 py-3";

export function ReviewerScreen() {
  return (
    <RequireRole allow="independent_reviewer" next="/reviewer">
      {() => <ReviewerDashboard />}
    </RequireRole>
  );
}

/** When the school said it was fixed; the oldest claim is checked first. */
function claimedAt(issue: Issue): string {
  return lastEvent(issue, "repair_claimed")?.occurredAt ?? issue.updatedAt;
}

/**
 * The reviewer's short list, then one repair at a time (`?review=<id>`):
 * three checks at the school and an optional photo, then the problem and the
 * repair side by side, a note, and two answers.
 */
function ReviewerDashboard() {
  const m = useMessages();
  const r = m.reviewer;
  const params = useSearchParams();
  const openId = params.get("review");
  const step: Step = params.get("step") === "decide" ? "decide" : "checks";
  const query = useQuery("reviews", () => getApi().listAssignedReviews());
  const [decided, setDecided] = useState<Decision | null>(null);

  const all = query.data;
  const waiting = (all ?? [])
    .filter((issue) => issue.review?.state === "awaiting")
    .sort((x, y) => claimedAt(x).localeCompare(claimedAt(y)));
  const done = (all ?? []).filter(
    (issue) => issue.review && issue.review.state !== "awaiting",
  );
  const openIndex = waiting.findIndex((issue) => issue.id === openId);
  const open = openIndex >= 0 ? waiting[openIndex] : null;

  if (all && open) {
    return (
      <ReviewFlow
        key={open.id}
        issue={open}
        position={openIndex + 1}
        total={waiting.length}
        step={step}
        onStep={(to) =>
          showInUrl(
            to === "decide" ? { review: open.id, step: "decide" } : { review: open.id },
          )
        }
        onBack={() => showInUrl(null)}
        onDecided={(updated, decision) => {
          query.setData(all.map((issue) => (issue.id === updated.id ? updated : issue)));
          setDecided(decision);
          showInUrl(null);
        }}
      />
    );
  }

  return (
    <PageShell
      eyebrow={m.auth.role.independent_reviewer}
      title={r.title}
      intro={r.intro}
      meta={
        all ? (
          <span data-testid="review-headline" className="vl-pagehero-note">
            {r.headline(waiting.length)}
          </span>
        ) : undefined
      }
    >
      <BuddyHint id="reviewer" />
      {query.error ? (
        <LoadError onRetry={query.reload} />
      ) : !all ? (
        <Loading />
      ) : (
        <>
          {decided ? (
            <div data-testid="review-decided" className="mb-6 max-w-2xl">
              <Notice tone="success" icon="check">
                <p ref={focusHere} tabIndex={-1} role="status" className="font-medium">
                  {r.decided[decided]}
                </p>
              </Notice>
            </div>
          ) : null}
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:items-start">
            <QueueGroup
              id="to-check"
              title={r.toCheck}
              rows={waiting.map((issue) => ({
                issue,
                line: `${issue.schoolName} · ${r.saidFixed(timeAgo(claimedAt(issue), m))}`,
                late: false,
              }))}
              empty={r.empty}
              itemTestId="review-item"
              onOpen={(issueId) => {
                setDecided(null);
                showInUrl({ review: issueId });
              }}
            />

            <section aria-labelledby="checked-title">
              <h2 id="checked-title" className="text-xl">
                {r.completed} <span className="text-muted">· {done.length}</span>
              </h2>
              {done.length === 0 ? (
                <p className="mt-3 rounded-2xl bg-sunken px-5 py-4 text-muted">
                  {r.emptyCompleted}
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3">
                  {done.map((issue) => (
                    <li key={issue.id} data-testid="review-done">
                      <Card className="flex flex-col gap-2">
                        <StatusPill status={issue.status} className="self-start" />
                        <h3 className="text-lg leading-snug">
                          <Link
                            href={`/issues/${issue.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {issue.title}
                          </Link>
                        </h3>
                        <p className="text-sm text-muted">
                          {issue.schoolName}, {issue.schoolTown}
                        </p>
                        {issue.review?.note ? (
                          <p className="rounded-xl bg-sunken px-4 py-3 whitespace-pre-line text-muted">
                            {issue.review.note}
                          </p>
                        ) : null}
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </PageShell>
  );
}

/** One question with two big answers. A tick marks the chosen one, so colour is not the only sign. */
function YesNo({
  name,
  question,
  value,
  onChange,
}: {
  name: string;
  question: string;
  value: boolean | null;
  onChange: (value: boolean) => void;
}) {
  const r = useMessages().reviewer;
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${name}-question`}
      className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4"
    >
      <p id={`${name}-question`} className="min-w-0 flex-1 font-medium">
        {question}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:w-48 sm:shrink-0">
        {[true, false].map((option) => {
          const id = `${name}-${option ? "yes" : "no"}`;
          return (
            <label key={id} htmlFor={id} className="relative flex">
              <input
                id={id}
                type="radio"
                name={name}
                checked={value === option}
                onChange={() => onChange(option)}
                className="peer absolute inset-0 size-full cursor-pointer opacity-0"
              />
              <span className="flex min-h-12 w-full items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 font-medium peer-checked:border-brand peer-checked:bg-brand-soft peer-checked:text-brand-strong peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                {value === option ? <Icon name="check" className="size-4" /> : null}
                {option ? r.yes : r.no}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** One side of the comparison: the photo for a purpose, or an honest tile when it cannot be shown. */
function Side({
  issue,
  purpose,
  label,
  photoLabel,
  when,
}: {
  issue: Issue;
  purpose: EvidencePurpose;
  label: string;
  photoLabel: string;
  when: string;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <EvidenceThumb
        items={issue.evidence}
        purpose={purpose}
        strict
        size="lg"
        title={issue.title}
        alt={`${photoLabel}: ${issue.title}`}
      />
      <figcaption className="text-center text-sm">
        <span className="block font-medium">{label}</span>
        {when ? <span className="block text-muted">{when}</span> : null}
      </figcaption>
    </figure>
  );
}

function ReviewFlow({
  issue,
  position,
  total,
  step,
  onStep,
  onBack,
  onDecided,
}: {
  issue: Issue;
  /** 1-based place of this repair in the "to check" list. */
  position: number;
  total: number;
  step: Step;
  onStep: (step: Step) => void;
  onBack: () => void;
  onDecided: (updated: Issue, decision: Decision) => void;
}) {
  const m = useMessages();
  const r = m.reviewer;
  const [answers, setAnswers] = useState<(boolean | null)[]>(() =>
    r.checks.map(() => null),
  );
  const [uploads, setUploads] = useState<EvidenceUpload[]>([]);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [note, setNote] = useState("");
  const [checksMissing, setChecksMissing] = useState(false);
  // Set by "Next": a reloaded address alone never jumps past the checks.
  const [checksDone, setChecksDone] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [showFiles, setShowFiles] = useState(false);
  const [pending, setPending] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const yesNo: readonly boolean[] | null = allAnswered(answers) ? answers : null;
  // The decision screen needs the three answers: without them, start at the checks.
  const now: Step = step === "decide" && yesNo && checksDone ? "decide" : "checks";
  const claim = lastEvent(issue, "repair_claimed");
  const reported = lastEvent(issue, "reported");
  const noteId = `review-note-${issue.id}`;
  const place = (
    <>
      <span>
        <Icon name="school" className="size-4" />
        {issue.schoolName}, {issue.schoolTown}
      </span>
      <span>
        <Icon name="mapPin" className="size-4" />
        {issue.location}
      </span>
    </>
  );

  /**
   * The demo shortcut: the three answers as Yes and a sample note, then the
   * "check before you record" box. Nothing is recorded until the reviewer
   * presses the verify button there.
   */
  function useSampleAnswers() {
    setAnswers(r.checks.map(() => true));
    setNote(m.procurement.reviewShortcut.sampleNote);
    setChecksMissing(false);
    setNoteError(null);
    setFailed(false);
    setChecksDone(true);
    onStep("decide");
    setPending("verified");
  }

  function toDecide() {
    if (!yesNo) return setChecksMissing(true);
    setChecksDone(true);
    onStep("decide");
  }

  function decide(decision: Decision) {
    if (!note.trim()) return setNoteError(r.noteRequired);
    setNoteError(null);
    setFailed(false);
    setPending(decision);
  }

  async function record() {
    if (!pending || !yesNo) return;
    setBusy(true);
    setFailed(false);
    try {
      const text = composeReviewNote(note, yesNo, r);
      const api = getApi();
      const updated =
        pending === "verified"
          ? await api.verifyCompletion(issue.id, text, uploads)
          : await api.disputeCompletion(issue.id, text, uploads);
      onDecided(updated, pending);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <div data-testid="review-card" data-step={now}>
      <BuddyHint id="reviewer" />
      {/* A new band for each step, so its title takes focus again. */}
      <PageHero
        key={now}
        size="compact"
        focusTitle
        back={
          now === "checks" ? (
            <BackButton onClick={onBack}>{r.position(position, total)}</BackButton>
          ) : (
            <BackButton onClick={() => onStep("checks")}>{r.backToChecks}</BackButton>
          )
        }
        title={issue.title}
        meta={place}
      />
      <Container size="narrow" className="flex flex-col gap-5">
        {now === "checks" ? (
          <Fragment key="checks">
            <Quote label={r.claimSays}>{claim?.note || r.noClaimNote}</Quote>

            {/* Who ordered, delivered and invoiced, by name. A reviewer is given no prices. */}
            <StaffCaseTrail issue={issue} />

            <div data-testid="review-shortcut" className={shortcutBox}>
              <Button
                variant="secondary"
                onClick={useSampleAnswers}
                className="w-full sm:w-auto sm:self-start"
              >
                <Icon name="sparkle" />
                {m.procurement.reviewShortcut.action}
              </Button>
              <p className="text-sm">{m.procurement.reviewShortcut.note}</p>
            </div>

            <section aria-labelledby="checks-title">
              <h2 id="checks-title" className="text-xl">
                {r.checksIntro}
              </h2>
              <div className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface px-4 shadow-card">
                {r.checks.map((check, index) => (
                  <YesNo
                    key={check.short}
                    name={`check-${index}`}
                    question={check.question}
                    value={answers[index]}
                    onChange={(value) =>
                      setAnswers(answers.map((old, i) => (i === index ? value : old)))
                    }
                  />
                ))}
              </div>
            </section>

            <section aria-label={r.photosTitle} className="no-print">
              {addingPhoto || uploads.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="font-medium">{r.photosTitle}</p>
                  <FilePicker
                    value={uploads}
                    onChange={setUploads}
                    label={r.photosLabel}
                  />
                  <p className="text-sm text-muted">{r.photosHelp}</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingPhoto(true)}
                  className="flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface px-4 py-4 text-center shadow-card transition-colors hover:border-brand"
                >
                  <Icon name="camera" className="size-6 text-brand-strong" />
                  <span className="font-medium">{r.photosTitle}</span>
                  <span className="text-sm text-muted">({m.common.optional})</span>
                </button>
              )}
            </section>

            <div className="no-print flex flex-col gap-2">
              <p
                role="alert"
                className={cn(
                  "text-sm font-medium text-danger",
                  !(checksMissing && !yesNo) && "hidden",
                )}
              >
                {checksMissing && !yesNo ? r.checksNeeded : null}
              </p>
              <Button size="lg" onClick={toDecide} className="w-full">
                {r.toDecide}
                <Icon name="arrowRight" />
              </Button>
            </div>
          </Fragment>
        ) : (
          <Fragment key="decide">
            <div className="grid grid-cols-2 gap-3">
              <Side
                issue={issue}
                purpose="problem"
                label={r.originalProblem}
                photoLabel={r.originalPhoto}
                when={r.reportedWhen(
                  reported
                    ? timeAgo(reported.occurredAt, m)
                    : formatDate(issue.createdAt),
                )}
              />
              <Side
                issue={issue}
                purpose="repair_claim"
                label={r.schoolRepair}
                photoLabel={r.claimPhoto}
                when={claim ? r.claimedWhen(timeAgo(claim.occurredAt, m)) : ""}
              />
            </div>

            <Card className="flex flex-col gap-4">
              <Quote label={r.reportSaid}>{issue.description}</Quote>
              <Quote label={r.claimSays}>{claim?.note || r.noClaimNote}</Quote>
              <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
                <Icon name="users" className="size-4" />
                {r.affected(issue.endorsements)}
              </p>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-sunken px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted">{r.yourAnswers}</p>
                <p data-testid="checks-line">{yesNo ? checksLine(yesNo, r) : ""}</p>
              </div>
              <button
                type="button"
                onClick={() => onStep("checks")}
                className={cn(quietLink, "no-print underline")}
              >
                {r.change}
              </button>
            </div>

            <Field id={noteId} label={r.noteLabel} hint={r.noteHint} error={noteError}>
              <Textarea
                id={noteId}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                aria-describedby={describedBy(noteId, {
                  hint: true,
                  error: Boolean(noteError),
                })}
                aria-invalid={Boolean(noteError)}
              />
            </Field>

            <section
              aria-labelledby="decision-title"
              className="no-print flex flex-col gap-3"
            >
              <h2 id="decision-title" className="text-xl">
                {r.decisionTitle}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <Button size="lg" onClick={() => decide("verified")} className="w-full">
                  <Icon name="shieldCheck" />
                  {r.yesFixed}
                </Button>
                <button
                  type="button"
                  onClick={() => decide("disputed")}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-danger bg-surface px-6 text-lg font-semibold text-danger transition-colors select-none hover:bg-danger-soft"
                >
                  <Icon name="alert" />
                  {r.notFixed}
                </button>
              </div>
              {failed && !pending ? (
                <p role="alert" className="font-semibold text-danger">
                  {m.common.actionError}
                </p>
              ) : null}
            </section>

            <div className="no-print flex flex-col items-start gap-1">
              <Button
                variant="quiet"
                aria-expanded={showFiles}
                aria-controls={`${noteId}-files`}
                onClick={() => setShowFiles(!showFiles)}
                className="-ml-3"
              >
                <Icon name="eye" />
                {showFiles ? r.hideFiles : r.allFiles(issue.evidence.length)}
              </Button>
              <div id={`${noteId}-files`} hidden={!showFiles} className="w-full">
                {showFiles ? (
                  <>
                    <p className="mb-3 text-sm text-muted">
                      {getApi().evidenceFileUrl ? r.privateFiles : r.noPreview}
                    </p>
                    <EvidenceList issueId={issue.id} items={issue.evidence} showFiles />
                  </>
                ) : null}
              </div>
              <Link href={`/issues/${issue.id}`} className={quietLink}>
                {r.publicPage}
              </Link>
            </div>
          </Fragment>
        )}
      </Container>

      <Dialog
        open={pending !== null}
        onClose={() => setPending(null)}
        title={r.confirm.title}
        description={r.confirm.intro}
        footer={
          <>
            <Button
              onClick={record}
              loading={busy}
              variant={pending === "disputed" ? "danger" : "primary"}
            >
              {pending === "disputed" ? r.dispute : r.verify}
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              {r.confirm.back}
            </Button>
          </>
        }
      >
        {pending && yesNo ? (
          <div className="flex flex-col gap-4">
            <dl data-testid="review-record" className="flex flex-col gap-3">
              <div>
                <dt className="text-sm font-semibold text-muted">{r.confirm.decision}</dt>
                <dd data-decision={pending} className="text-lg font-semibold">
                  {r.confirm[pending]}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted">{r.confirm.note}</dt>
                <dd
                  data-testid="review-note"
                  className="mt-1 rounded-xl bg-sunken px-4 py-3 whitespace-pre-line"
                >
                  {composeReviewNote(note, yesNo, r)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-muted">{r.confirm.photos}</dt>
                <dd>{r.confirm.photoCount(uploads.length)}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted">{r.confirm.checksAdded}</p>
            {pending === "verified" && yesNo.includes(false) ? (
              <Notice tone="warning" icon="alert">
                {r.confirm.warnNo}
              </Notice>
            ) : null}
            <p className="text-sm text-muted">
              {pending === "verified" ? r.confirm.verifyHelp : r.confirm.disputeHelp}
            </p>
            <details className="group rounded-xl border border-line">
              <summary className="flex min-h-11 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden justify-between gap-2 px-4 font-semibold text-brand-strong">
                {r.confirm.technical}
                <Icon name="chevronDown" className="size-4 group-open:rotate-180" />
              </summary>
              <div className="border-t border-line px-4 py-3 text-sm">
                <p className="font-semibold">{r.ledgerTitle}</p>
                <ul data-testid="ledger-statement" className="mt-1 list-disc pl-5">
                  {r.ledgerItems.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="mt-2 font-semibold">{r.ledgerNot}</p>
                {isSampleRecord(claim?.ledger) ? (
                  <p className="mt-2">{r.ledgerSample}</p>
                ) : null}
              </div>
            </details>
            {failed ? (
              <p role="alert" className="font-semibold text-danger">
                {m.common.actionError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
