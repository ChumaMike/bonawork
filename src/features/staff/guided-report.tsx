"use client";

import Link from "next/link";
import { useState } from "react";
import { BuddyHint } from "@/components/buddy/buddy-hint";
import { FilePicker } from "@/components/file-picker";
import { EvidenceThumb, photoUrl } from "@/components/staff/evidence-thumb";
import { BackButton, FlowTitle, Quote, StepHeading } from "@/components/staff/flow";
import { VerifyAttempt } from "@/components/staff/verify-attempt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { describedBy, Field, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Container, Notice } from "@/components/ui/page";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError, getApi } from "@/data/api";
import type { EvidenceUpload, Issue } from "@/data/types";
import { useMessages } from "@/i18n";
import { timeAgo } from "@/lib/format";
import { StaffCaseTrail } from "../procurement/tasks";
import {
  ANSWERS,
  lastEvent,
  lastSchoolUpdate,
  needsReply,
  unprotected,
  waitInfo,
  type Action,
} from "./queue";

const quietLink =
  "inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-strong underline-offset-4 hover:underline";

/**
 * One report at a time: the report, how long it has waited and how many
 * people it affects, then the one or two answers that fit its status as big
 * buttons. Choosing an answer asks for the words that go with it; recording
 * it offers the next report. Nothing here verifies a repair: on a report
 * that waits for review the school can only watch the ledger refuse it.
 */
export function GuidedReport({
  issue,
  next,
  onBack,
  onOpen,
  onChanged,
}: {
  issue: Issue;
  /** The next report that needs a reply, and how many do besides this one. */
  next: { id: string; more: number } | null;
  onBack: () => void;
  onOpen: (issueId: string) => void;
  /** Called with the report as the backend returned it after an answer. */
  onChanged: (updated: Issue) => void;
}) {
  const m = useMessages();
  const a = m.admin;
  const [answer, setAnswer] = useState<Action | null>(null);
  const [recorded, setRecorded] = useState<Action | null>(null);
  // Coming back to the answers from a form or a result: the question takes focus.
  const [returning, setReturning] = useState(false);
  const wait = waitInfo(issue, m);
  const answers = ANSWERS[issue.status];

  return (
    <Container size="narrow">
      <BuddyHint id="admin" />
      <div data-testid="guided-report">
        <BackButton onClick={onBack}>{a.backToList}</BackButton>
        <header className="mt-1 mb-5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={issue.status} />
            {wait ? (
              <span
                data-testid="waited"
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
                  wait.late ? "bg-danger-soft text-danger" : "bg-sunken text-muted",
                )}
              >
                <Icon name="clock" className="size-4" />
                {wait.label}
              </span>
            ) : null}
          </div>
          <FlowTitle>{issue.title}</FlowTitle>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <Icon name="mapPin" className="size-4" />
              {issue.location}
            </span>
            <span className="font-mono">{issue.reference}</span>
          </p>
        </header>

        {recorded ? (
          <Recorded
            action={recorded}
            next={next}
            canAnswerMore={answers.main.length > 0}
            onAnother={() => {
              setReturning(true);
              setRecorded(null);
            }}
            onBack={onBack}
            onOpen={onOpen}
          />
        ) : answer ? (
          <AnswerForm
            key={answer}
            issue={issue}
            action={answer}
            onCancel={() => {
              setReturning(true);
              setAnswer(null);
            }}
            onDone={(updated) => {
              onChanged(updated);
              setRecorded(answer);
              setAnswer(null);
            }}
          />
        ) : (
          <div className="flex flex-col gap-5">
            <ReportSummary issue={issue} />
            <Standing issue={issue} />
            {/* Who ordered, delivered and invoiced, by name. A school is given no prices. */}
            <StaffCaseTrail issue={issue} />
            {answers.main.length > 0 ? (
              <AnswerChoice
                main={answers.main}
                other={answers.other}
                focusTitle={returning}
                onChoose={setAnswer}
              />
            ) : null}
            <div className="no-print flex flex-col items-center gap-1">
              {next && needsReply(issue.status) ? (
                <Button variant="quiet" onClick={() => onOpen(next.id)}>
                  {a.skip(next.more)}
                  <Icon name="arrowRight" className="size-4" />
                </Button>
              ) : null}
              <Link href={`/issues/${issue.id}`} className={quietLink}>
                {a.publicPage}
              </Link>
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}

/** What was reported: the words, how many people it affects, and the photo when it can be shown. */
function ReportSummary({ issue }: { issue: Issue }) {
  const m = useMessages();
  const photos = issue.evidence.filter(
    (item) => item.purpose === "problem" && item.mediaType.startsWith("image/"),
  );
  return (
    <Card className="flex flex-col gap-3">
      {photoUrl(photos) ? (
        <EvidenceThumb items={photos} title={issue.title} size="lg" />
      ) : null}
      <p>{issue.description}</p>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-muted">
        <span data-testid="affected" className="inline-flex items-center gap-1.5">
          <Icon name="users" className="size-4" />
          {m.endorse.count(issue.endorsements)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Icon name="image" className="size-4" />
          {m.admin.photos(photos.length)}
        </span>
      </p>
    </Card>
  );
}

/** Where the report stands, in one block: only what matters for its status. */
function Standing({ issue }: { issue: Issue }) {
  const m = useMessages();
  const a = m.admin;

  if (issue.status === "repair_claimed") {
    const claim = lastEvent(issue, "repair_claimed");
    return (
      <section aria-labelledby="claimed-title" className="flex flex-col gap-4">
        <div>
          <h2 id="claimed-title" className="text-xl">
            {a.claimedTitle}
          </h2>
          <p className="mt-1 text-muted">{a.claimedBody}</p>
        </div>
        {claim?.note ? <Quote label={a.youWrote}>{claim.note}</Quote> : null}
        <VerifyAttempt issueId={issue.id} />
      </section>
    );
  }

  if (issue.status === "disputed") {
    return (
      <Notice tone="danger" icon="alert" title={a.disputedTitle}>
        {issue.review?.note ? (
          <Quote label={a.reviewerWrote}>{issue.review.note}</Quote>
        ) : null}
      </Notice>
    );
  }

  if (issue.status === "independently_verified") {
    return (
      <Notice tone="success" icon="shieldCheck" title={a.verifiedTitle}>
        <p>{a.verifiedBody}</p>
        {issue.review?.note ? (
          <Quote label={a.reviewerWrote} className="mt-3">
            {issue.review.note}
          </Quote>
        ) : null}
      </Notice>
    );
  }

  if (issue.status === "declined") {
    const declined = lastEvent(issue, "declined");
    return (
      <Notice tone="warning" icon="ban" title={a.declinedTitle}>
        {declined?.note ? <Quote label={a.declinedReason}>{declined.note}</Quote> : null}
      </Notice>
    );
  }

  const update = issue.status === "reported" ? undefined : lastSchoolUpdate(issue);
  if (!update && !unprotected(issue)) return null;
  return (
    <div className="flex flex-col gap-4">
      {unprotected(issue) ? (
        <Notice tone="warning" icon="alert" title={a.reasonNoProtection} />
      ) : null}
      {update ? (
        <Quote label={a.lastUpdate(timeAgo(update.occurredAt, m))}>{update.note}</Quote>
      ) : null}
    </div>
  );
}

/** The one or two answers for this status as big buttons; the rest behind "Other answers". */
function AnswerChoice({
  main,
  other,
  focusTitle,
  onChoose,
}: {
  main: Action[];
  other: Action[];
  /** True when the person comes back to the answers, so the question is announced again. */
  focusTitle: boolean;
  onChoose: (action: Action) => void;
}) {
  const m = useMessages();
  const a = m.admin;
  const [showOther, setShowOther] = useState(false);
  return (
    <section aria-labelledby="answer-title" className="no-print flex flex-col gap-3">
      {focusTitle ? (
        <StepHeading id="answer-title">{a.question}</StepHeading>
      ) : (
        <h2 id="answer-title" className="text-xl">
          {a.question}
        </h2>
      )}
      {main.map((action, index) => (
        <Button
          key={action}
          size="lg"
          variant={index === 0 ? "primary" : "secondary"}
          onClick={() => onChoose(action)}
          className="w-full"
        >
          {a.actions[action].label}
        </Button>
      ))}
      {other.length > 0 ? (
        <>
          <Button
            variant="quiet"
            aria-expanded={showOther}
            aria-controls="other-answers"
            onClick={() => setShowOther(!showOther)}
          >
            {a.otherAnswers}
            <Icon name={showOther ? "chevronUp" : "chevronDown"} className="size-4" />
          </Button>
          <div
            id="other-answers"
            hidden={!showOther}
            className={cn(showOther && "flex flex-col gap-2")}
          >
            {other.map((action) => (
              <Button
                key={action}
                variant="secondary"
                onClick={() => onChoose(action)}
                className="w-full"
              >
                {a.actions[action].label}
              </Button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** One answer, one box for the words that go with it, one button to record it. */
function AnswerForm({
  issue,
  action,
  onCancel,
  onDone,
}: {
  issue: Issue;
  action: Action;
  onCancel: () => void;
  onDone: (updated: Issue) => void;
}) {
  const m = useMessages();
  const a = m.admin;
  const copy = a.actions[action];
  const [note, setNote] = useState("");
  const [uploads, setUploads] = useState<EvidenceUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function record(text: string): Promise<Issue> {
    const api = getApi();
    switch (action) {
      case "assess":
        return api.startAssessment(issue.id, text);
      case "progress":
        return api.recordProgress(issue.id, text);
      case "protect":
        return api.recordInterimProtection(issue.id, text);
      case "claim":
        return api.submitRepairClaim(issue.id, text, uploads);
      case "decline":
        return api.declineIssue(issue.id, text);
    }
  }

  async function save() {
    const text = note.trim();
    if (!text) return setError(m.common.required);
    setBusy(true);
    setError(null);
    try {
      onDone(await record(text));
    } catch (cause) {
      const refused = cause instanceof ApiError && cause.code === "invalid_transition";
      setError(refused ? a.notPossible : m.common.actionError);
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="answer-form-title"
      data-testid="answer-form"
      data-action={action}
      className="flex flex-col gap-5"
    >
      <div>
        <StepHeading id="answer-form-title">{copy.label}</StepHeading>
        <p className="mt-1 text-muted">{copy.help}</p>
      </div>

      <Field id="admin-note" label={copy.field} error={error}>
        <Textarea
          id="admin-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy("admin-note", { error: Boolean(error) })}
        />
      </Field>

      {action === "claim" ? (
        <>
          <div className="flex flex-col gap-2">
            <p className="font-semibold">
              {a.claimEvidence}{" "}
              <span className="font-normal text-muted">({m.common.optional})</span>
            </p>
            <FilePicker value={uploads} onChange={setUploads} label={a.claimEvidence} />
          </div>
          <Notice tone="warning" icon="alert" title={m.brand.principleClaim}>
            <p data-testid="claim-warning">{a.claimWarning}</p>
            <p className="mt-2">{a.claimConfirm}</p>
          </Notice>
        </>
      ) : (
        <>
          {action === "decline" ? (
            <Notice tone="warning" icon="alert">
              {a.declineWarning}
            </Notice>
          ) : null}
          <p className="text-sm text-muted">{copy.note}</p>
        </>
      )}

      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          onClick={save}
          loading={busy}
          variant={action === "decline" ? "danger" : "primary"}
          className="w-full"
        >
          {copy.submit}
        </Button>
        <Button variant="quiet" onClick={onCancel} disabled={busy}>
          <Icon name="arrowLeft" className="size-4" />
          {a.backToAnswers}
        </Button>
      </div>
    </section>
  );
}

/** After an answer: that it was recorded, what the report shows now, and the way on. */
function Recorded({
  action,
  next,
  canAnswerMore,
  onAnother,
  onBack,
  onOpen,
}: {
  action: Action;
  next: { id: string; more: number } | null;
  canAnswerMore: boolean;
  onAnother: () => void;
  onBack: () => void;
  onOpen: (issueId: string) => void;
}) {
  const m = useMessages();
  const a = m.admin;
  return (
    <section
      aria-labelledby="recorded-title"
      data-testid="answer-recorded"
      className="flex flex-col gap-4"
    >
      <div className="flex gap-3 rounded-xl border border-st-verified bg-st-verified-soft p-4">
        <Icon name="check" className="mt-0.5 size-6" />
        <div className="min-w-0">
          <StepHeading id="recorded-title" className="text-xl">
            {a.saved}
          </StepHeading>
          <p className="mt-1">{a.actions[action].after}</p>
        </div>
      </div>
      <div className="no-print flex flex-col gap-2">
        {next ? (
          <Button size="lg" onClick={() => onOpen(next.id)} className="w-full">
            {a.nextReport(next.more)}
            <Icon name="arrowRight" />
          </Button>
        ) : null}
        <Button
          size="lg"
          variant={next ? "secondary" : "primary"}
          onClick={onBack}
          className="w-full"
        >
          {a.backToListDone}
        </Button>
        <Button variant="quiet" onClick={onAnother}>
          {canAnswerMore ? a.another : a.seeReport}
        </Button>
      </div>
    </section>
  );
}
