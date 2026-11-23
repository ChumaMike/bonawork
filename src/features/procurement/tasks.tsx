"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { FlowTitle, focusHere } from "@/components/staff/flow";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { LoadError, Loading, Notice } from "@/components/ui/page";
import { StatusPill } from "@/components/ui/status-pill";
import { ApiError, getApi } from "@/data/api";
import { ReleaseBlockedError } from "@/data/http-api";
import { useSession } from "@/data/session";
import type { Issue, MoneyTrail } from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import { InvoiceForm, sendCorrectedSample } from "./invoice-form";
import { MatchResult } from "./match-result";
import { StaffTrail } from "./money-trail";
import { OrderDetails } from "./order-details";
import { OrderForm } from "./order-form";
import { deliverySentence, ReceiptForm } from "./receipt-form";
import { ReleaseGate } from "./release-gate";
import { StagePill } from "./stage-pill";

const quietLink =
  "no-print inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-strong underline-offset-4 hover:underline";

interface CaseData {
  issue: Issue;
  /** Null while the case has no work order this person may see. */
  trail: MoneyTrail | null;
}

interface BodyProps extends CaseData {
  /** Replace the trail with the one a write returned. */
  update: (trail: MoneyTrail) => void;
}

/**
 * One case for one task: loads the public report and the trail as this
 * person may see it, shows the title and where things stand, then the task.
 */
function CaseFrame({
  issueId,
  header = true,
  children,
}: {
  issueId: string;
  /** False inside a card that already names the case. */
  header?: boolean;
  children: (props: BodyProps) => ReactNode;
}) {
  const m = useMessages();
  const query = useQuery(`case:${issueId}`, async (): Promise<CaseData | null> => {
    const api = getApi();
    const [issue, trail] = await Promise.all([
      api.getIssue(issueId),
      api.getMoneyTrail(issueId),
    ]);
    return issue ? { issue, trail } : null;
  });

  if (query.error) return <LoadError onRetry={query.reload} />;
  if (query.data === undefined) return <Loading lines={2} />;
  if (query.data === null) {
    return (
      <Notice tone="warning" icon="alert">
        <p>{m.procurement.home.notFound}</p>
      </Notice>
    );
  }
  const { issue, trail } = query.data;
  return (
    <div className="flex flex-col gap-5">
      {header ? (
        <header className="mt-1 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={issue.status} />
            <StagePill stage={trail?.stage ?? null} />
          </div>
          <FlowTitle>{issue.title}</FlowTitle>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted">
            <span className="font-mono">{issue.reference}</span>
            <span aria-hidden="true">·</span>
            <span>{issue.schoolName}</span>
          </p>
        </header>
      ) : null}
      {children({
        issue,
        trail,
        update: (next) => query.setData({ issue, trail: next }),
      })}
      {header ? (
        <Link href={`/issues/${issue.id}`} className={quietLink}>
          {m.procurement.home.publicPage}
          <Icon name="arrowRight" className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

/** The sentence after a successful action. It takes focus, so it is seen and announced. */
function Success({ children }: { children: ReactNode }) {
  return (
    <Notice tone="success" icon="shieldCheck">
      <p
        ref={focusHere}
        tabIndex={-1}
        role="status"
        data-testid="task-success"
        className="font-semibold"
      >
        {children}
      </p>
    </Notice>
  );
}

function NotYours() {
  const m = useMessages();
  return (
    <Notice tone="warning" icon="alert">
      <p data-testid="no-task">{m.procurement.home.notFound}</p>
    </Notice>
  );
}

/* --------------------------------- Buyer --------------------------------- */

/** The buyer: read the problem, write the work order, approve it. */
export function BuyerTask({ issueId }: { issueId: string }) {
  return <CaseFrame issueId={issueId}>{(props) => <BuyerBody {...props} />}</CaseFrame>;
}

function BuyerBody({ issue, trail, update }: BodyProps) {
  const m = useMessages();
  const f = m.procurement.orderForm;
  const [approved, setApproved] = useState(false);

  if (trail) {
    return (
      <>
        {approved ? <Success>{f.success}</Success> : null}
        <StaffTrail trail={trail} timeline={issue.timeline} status={issue.status} />
      </>
    );
  }
  return (
    <>
      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-muted">{f.problem}</h2>
        <p>{issue.description}</p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="mapPin" className="size-4" />
            {issue.location}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="users" className="size-4" />
            {m.endorse.count(issue.endorsements)}
          </span>
        </p>
      </Card>
      <OrderForm
        sample={{
          supplierRef: m.procurement.orderShortcut.supplierRef,
          scope: m.procurement.orderShortcut.scope(issue.title, issue.location),
          lines: m.procurement.orderShortcut.lines,
        }}
        onSubmit={async (input) => {
          const next = await getApi().approveWorkOrder(issue.id, input);
          setApproved(true);
          update(next);
        }}
      />
    </>
  );
}

/* -------------------------------- Supplier -------------------------------- */

/** The supplier: acknowledge the order, then send the invoice and see what the rules say. */
export function SupplierTask({ issueId }: { issueId: string }) {
  return (
    <CaseFrame issueId={issueId}>{(props) => <SupplierBody {...props} />}</CaseFrame>
  );
}

function SupplierBody({ issue, trail, update }: BodyProps) {
  const m = useMessages();
  const a = m.procurement.acknowledge;
  const [acknowledged, setAcknowledged] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [quick, setQuick] = useState<"reading" | "sending" | null>(null);
  const [quickFailed, setQuickFailed] = useState(false);

  if (!trail) return <NotYours />;
  const shown = trail;

  /** The demo shortcut: read the corrected sample with Bona AI and send it, in one press. */
  async function sendSample() {
    setQuick("reading");
    setQuickFailed(false);
    try {
      const next = await sendCorrectedSample(getApi(), issue.id, shown.order, () =>
        setQuick("sending"),
      );
      // Something could not be read: the normal steps, where every field is checked.
      if (!next) return setCorrecting(true);
      setAcknowledged(false);
      update(next);
    } catch {
      setQuickFailed(true);
    } finally {
      setQuick(null);
    }
  }

  if (!trail.order.acknowledged) {
    const acknowledge = async () => {
      setBusy(true);
      setFailed(false);
      try {
        const next = await getApi().acknowledgeOrder(issue.id);
        setAcknowledged(true);
        update(next);
      } catch {
        setFailed(true);
      } finally {
        setBusy(false);
      }
    };
    return (
      <section
        aria-labelledby="acknowledge-title"
        data-testid="acknowledge-order"
        className="flex flex-col gap-4"
      >
        <div>
          <h2 id="acknowledge-title" className="text-xl">
            {a.title}
          </h2>
          <p className="mt-1 text-muted">{a.intro}</p>
        </div>
        <OrderDetails order={trail.order} />
        {failed ? (
          <Notice tone="danger" icon="alert">
            <p role="alert">{m.common.actionError}</p>
          </Notice>
        ) : null}
        <Button size="lg" loading={busy} onClick={() => void acknowledge()}>
          {a.submit}
        </Button>
      </section>
    );
  }

  const match = trail.invoices.at(-1)?.match ?? null;
  const settled = trail.releaseAuthorisedAt !== null || match?.outcome === "matched";
  if (settled) {
    return (
      <>
        {match ? (
          <div ref={focusHere} tabIndex={-1}>
            <MatchResult issueId={issue.id} match={match} />
          </div>
        ) : null}
        <StaffTrail trail={trail} timeline={issue.timeline} status={issue.status} />
      </>
    );
  }

  // The latest invoice was blocked: the result first, the invoice steps one tap away.
  const showResult = match?.outcome === "blocked" && !correcting;
  return (
    <>
      {acknowledged ? <Success>{a.success}</Success> : null}
      {showResult && match ? (
        <div ref={focusHere} tabIndex={-1}>
          <MatchResult
            issueId={issue.id}
            match={match}
            onCorrect={() => setCorrecting(true)}
          />
          {trail.order.totalCents !== undefined ? (
            <div
              data-testid="quick-resubmit"
              className="mt-4 flex flex-col gap-2 rounded-2xl border border-dashed border-accent bg-accent-soft px-4 py-3"
            >
              <Button
                variant="secondary"
                loading={quick !== null}
                onClick={() => void sendSample()}
                className="w-full sm:w-auto sm:self-start"
              >
                <Icon name="sparkle" />
                {m.procurement.match.quick.action}
              </Button>
              <p aria-live="polite" className="text-sm">
                {quick === "reading"
                  ? m.procurement.match.quick.reading
                  : quick === "sending"
                    ? m.procurement.match.quick.sending
                    : m.procurement.match.quick.note}
              </p>
              {quickFailed ? (
                <p role="alert" className="text-sm font-semibold text-danger">
                  {m.procurement.match.quick.failed}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {/* Hidden, not removed, while the result shows: the typed fields are kept. */}
      <div hidden={showResult} className={showResult ? undefined : "flex flex-col gap-5"}>
        <details className="rounded-2xl border border-line bg-surface px-4">
          <summary className="flex min-h-12 cursor-pointer items-center font-semibold">
            {m.procurement.order.see}
          </summary>
          <div className="pb-4">
            <OrderDetails order={trail.order} />
          </div>
        </details>
        <InvoiceForm
          trail={trail}
          onSubmitted={(next) => {
            setAcknowledged(false);
            setCorrecting(false);
            update(next);
          }}
        />
      </div>
    </>
  );
}

/* ---------------------------- Receiving officer --------------------------- */

/** The receiving officer: count what arrived. Quantities only; this role is given no prices. */
export function ReceivingTask({ issueId }: { issueId: string }) {
  return (
    <CaseFrame issueId={issueId}>{(props) => <ReceivingBody {...props} />}</CaseFrame>
  );
}

function ReceivingBody({ issue, trail, update }: BodyProps) {
  const m = useMessages();
  const f = m.procurement.receiptForm;
  const [sentence, setSentence] = useState<string | null>(null);

  if (!trail) return <NotYours />;
  const recorded = trail.receipts.some(
    (receipt) => receipt.orderVersion === trail.order.version,
  );
  if (sentence || recorded) {
    return (
      <>
        <Success>{sentence ?? f.recorded}</Success>
        <StaffTrail trail={trail} timeline={issue.timeline} status={issue.status} />
      </>
    );
  }
  return (
    <>
      <Card className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-muted">{m.procurement.order.scope}</h2>
        <p>{trail.order.description}</p>
        <p className="text-sm text-muted">{trail.order.supplierName}</p>
      </Card>
      <ReceiptForm
        order={trail.order}
        onSubmit={async (input) => {
          const next = await getApi().recordGoodsReceipt(issue.id, input);
          setSentence(deliverySentence(trail.order, input.lines, m));
          update(next);
        }}
      />
    </>
  );
}

/* ----------------------------- Payment approver --------------------------- */

/**
 * The payment approver: the release gate. Locked, it lists what must still
 * happen; open, it offers the one button. The gate is decided by the backend
 * each time: a refused attempt reloads the trail and shows the blockers.
 */
export function ReleaseTask({
  issueId,
  inCard = false,
  onOpen,
}: {
  issueId: string;
  /** Inside the "Next for you" card: the gate alone, with a link to the full case. */
  inCard?: boolean;
  onOpen?: () => void;
}) {
  return (
    <CaseFrame issueId={issueId} header={!inCard}>
      {(props) => <ReleaseBody {...props} inCard={inCard} onOpen={onOpen} />}
    </CaseFrame>
  );
}

function ReleaseBody({
  issue,
  trail,
  update,
  inCard,
  onOpen,
}: BodyProps & { inCard: boolean; onOpen?: () => void }) {
  const m = useMessages();
  const g = m.procurement.gate;
  const { session } = useSession();
  const [authorised, setAuthorised] = useState(false);
  const [conflict, setConflict] = useState(false);

  if (!trail) return <NotYours />;
  const shown = trail;

  async function authorise() {
    try {
      const next = await getApi().authoriseRelease(issue.id);
      setConflict(false);
      setAuthorised(true);
      update(next);
    } catch (cause) {
      setConflict(true);
      // The gate was shut after all. Lock the card with the blockers the
      // backend returned, then show the case as it stands now.
      if (cause instanceof ReleaseBlockedError) {
        update({ ...shown, gate: { open: false, blockers: cause.blockers } });
      }
      if (cause instanceof ApiError && cause.code === "conflict") {
        const fresh = await getApi()
          .getMoneyTrail(issue.id)
          .catch(() => null);
        if (fresh) update(fresh);
      }
    }
  }

  const releasedBy = trail.steps.findLast(
    (step) => step.type === "release_authorised",
  )?.actorName;
  return (
    <>
      {authorised ? <Success>{g.success}</Success> : null}
      <ReleaseGate
        trail={trail}
        status={issue.status}
        onAuthorise={authorise}
        conflict={conflict}
        byYou={authorised || (!!releasedBy && releasedBy === session?.user.displayName)}
      />
      {trail.releaseAuthorisedAt || trail.gate.open ? null : (
        <AskWhatBlocks key={trail.gate.blockers.length} reference={trail.reference} />
      )}
      {inCard ? (
        onOpen ? (
          <button type="button" onClick={onOpen} className={`${quietLink} self-start`}>
            {m.procurement.trail.staffTitle}
            <Icon name="arrowRight" className="size-4" />
          </button>
        ) : null
      ) : (
        <StaffTrail trail={trail} timeline={issue.timeline} status={issue.status} />
      )}
    </>
  );
}

/**
 * One question for Bona AI, as a chip: what is blocking this release? The
 * assistant answers from the release gate. It is an explanation beside the
 * checklist, in a dashed box of its own: the checklist is what counts.
 */
function AskWhatBlocks({ reference }: { reference: string }) {
  const m = useMessages();
  const g = m.procurement.gate;
  const question = g.askAi(reference);
  // undefined: not asked. "asking": waiting. null: it failed.
  const [answer, setAnswer] = useState<string | null | "asking">();

  async function ask() {
    setAnswer("asking");
    try {
      const reply = await getApi().askAssistant(
        [{ id: "question", role: "user", text: question }],
        question,
      );
      setAnswer(reply.text);
    } catch {
      setAnswer(null);
    }
  }

  return (
    <div data-testid="ask-bona-ai" className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => void ask()}
        disabled={answer === "asking"}
        aria-busy={answer === "asking" || undefined}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-dashed border-accent bg-accent-soft px-4 text-left text-sm font-semibold text-accent disabled:opacity-60"
      >
        <Icon name="sparkle" className="size-4" />
        {question}
      </button>
      {answer !== undefined && answer !== "asking" ? (
        <div
          role="status"
          data-testid="bona-ai-answer"
          className="w-full rounded-2xl border-2 border-dashed border-line-strong bg-sunken p-4"
        >
          <p className="text-sm font-semibold text-muted">{g.aiLabel}</p>
          <p className="mt-1">{answer ?? g.aiFailed}</p>
          {answer ? <p className="mt-2 text-sm text-muted">{g.aiNote}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------ Other screens ----------------------------- */

/**
 * The staff trail of a case, for screens that are about something else (the
 * school's report, the reviewer's check). It shows nothing while the case has
 * no work order, or none this person may see.
 */
export function StaffCaseTrail({
  issue,
}: {
  issue: Pick<Issue, "id" | "timeline" | "status">;
}) {
  // The gate and the stage follow the report status, so a new status asks again.
  const query = useQuery(`money-trail:${issue.id}:${issue.status}`, () =>
    getApi().getMoneyTrail(issue.id),
  );
  if (!query.data) return null;
  return (
    <StaffTrail trail={query.data} timeline={issue.timeline} status={issue.status} />
  );
}
