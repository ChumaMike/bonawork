"use client";

import { useState, type ReactNode } from "react";
import { LedgerChip } from "@/components/ledger-state";
import { ProofButton } from "@/components/proof/proof-button";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import type {
  IssueStatus,
  MoneyTrail,
  PublicTrailStep,
  TimelineEvent,
  TimelineEventType,
} from "@/data/types";
import { useMessages } from "@/i18n";
import type { TrailRowKey } from "@/i18n/en-procurement";
import { formatDate } from "@/lib/format";
import { MatchResult } from "./match-result";
import { formatRand } from "./money";
import { OrderDetails } from "./order-details";
import { buildTrailRows, invoiceOutcomes, trailTime, type TrailRow } from "./trail-rows";

/** The report's own records that are anchored as a commitment document anyone may check. */
const REPORT_DOCUMENTS = new Set<TimelineEventType>(["reported", "verified", "disputed"]);
/** The procurement steps anchored as a document. Only people who may read the trail get it. */
const FINANCE_DOCUMENTS: ReadonlySet<TimelineEventType> = new Set<TimelineEventType>([
  "work_order_approved",
  "invoice_submitted",
  "goods_receipt_recorded",
  "match_recorded",
  "release_authorised",
]);
/**
 * The two of those documents that hold no price. A reader without prices is
 * offered only these: the backend refuses them the body of the others, and a
 * button that would fail is not shown.
 */
const PRICELESS_DOCUMENTS: ReadonlySet<TimelineEventType> = new Set<TimelineEventType>([
  "goods_receipt_recorded",
  "release_authorised",
]);
const NO_DOCUMENTS: ReadonlySet<TimelineEventType> = new Set<TimelineEventType>();

const link =
  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 font-semibold text-brand-strong underline-offset-4 hover:underline";

/**
 * Something one tap away. Its content is only built once it has been opened,
 * so an explanation is not asked for until someone wants to read it.
 */
function Reveal({ summary, children }: { summary: string; children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  return (
    <details onToggle={(event) => event.currentTarget.open && setOpened(true)}>
      <summary className={link}>{summary}</summary>
      {opened ? <div className="mt-2 flex flex-col gap-4">{children}</div> : null}
    </details>
  );
}

interface RowExtras {
  /** The named person. Staff only; the public never gets a name. */
  name?: string | null;
  /** Lines under the row: what was ordered, invoiced, delivered. Staff only. */
  detail?: ReactNode;
}

/** The marker on the rail: filled when done, a ring while waiting, red when blocked. */
function Marker({ row }: { row: TrailRow }) {
  if (row.state === "done") {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand motion-safe:transition-colors motion-safe:duration-200">
        <Icon name="check" className="size-4" />
      </span>
    );
  }
  if (row.state === "blocked") {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-danger text-on-brand">
        <Icon name="alert" className="size-4" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full border-2 bg-surface",
        row.next ? "border-accent text-accent" : "border-line-strong",
      )}
    >
      {row.next ? <Icon name="clock" className="size-4" /> : null}
    </span>
  );
}

/**
 * The eight rows. Shared by the public and the staff version: what differs is
 * only what each passes in as `extras`, and whether a procurement step offers
 * its document.
 */
function TrailList({
  issueId,
  rows,
  sentences,
  extras = {},
  financeDocuments,
  earlierBlocked,
  earlierDetail,
}: {
  issueId: string;
  rows: TrailRow[];
  /** The sentence under a done or blocked row, where it has one. */
  sentences: Partial<Record<TrailRowKey, string>>;
  extras?: Partial<Record<TrailRowKey, RowExtras>>;
  /** The procurement steps whose document this reader may open. Empty for the public. */
  financeDocuments: ReadonlySet<TimelineEventType>;
  earlierBlocked: number;
  /** The earlier attempts, for staff. */
  earlierDetail?: ReactNode;
}) {
  const m = useMessages();
  const t = m.procurement.trail;
  return (
    <ol data-testid="trail" className="flex max-w-xl flex-col">
      {rows.map((row, index) => {
        const below = rows[index + 1];
        const solid = row.state === "done" && below && below.state !== "waiting";
        const extra = extras[row.key];
        const title = t.title[row.key];
        const role = row.key === "match" ? m.procurement.rules : m.actor[row.actor];
        const sentence = row.record ? sentences[row.key] : t.waiting[row.key];
        const withDocument = row.record
          ? REPORT_DOCUMENTS.has(row.record.type) || financeDocuments.has(row.record.type)
          : false;
        return (
          <li
            key={row.key}
            data-testid="trail-row"
            data-row={row.key}
            data-state={row.state}
            aria-current={row.next ? "step" : undefined}
            className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3"
          >
            <div className="flex flex-col items-center">
              <Marker row={row} />
              {below ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "my-1 w-0 flex-1 border-l-2",
                    solid ? "border-brand" : "border-dashed border-line-strong",
                  )}
                />
              ) : null}
            </div>
            <div className={cn("min-w-0", below && "pb-5 md:pb-6")}>
              <h3 className="flex flex-wrap items-center gap-x-2 leading-7 font-semibold">
                <span>
                  <span className="sr-only">{t.state[row.state]} </span>
                  {title}
                </span>
                {row.next ? (
                  <span className="rounded-full bg-accent-soft px-2.5 text-sm font-semibold text-accent">
                    {t.next}
                  </span>
                ) : null}
              </h3>
              {row.record ? (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  {extra?.name ? (
                    <span data-testid="trail-person" className="font-semibold text-ink">
                      {extra.name}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center rounded-full bg-earth-soft px-2.5 py-0.5 font-semibold text-earth-strong">
                    {role}
                  </span>
                  <time
                    dateTime={row.record.occurredAt}
                    title={formatDate(row.record.occurredAt)}
                  >
                    {trailTime(row.record.occurredAt, m)}
                  </time>
                </p>
              ) : null}
              {sentence ? (
                <p
                  className={cn(
                    "mt-1",
                    row.state === "blocked" ? "font-semibold text-danger" : "text-muted",
                  )}
                >
                  {sentence}
                </p>
              ) : null}
              {row.key === "match" && row.record && earlierBlocked > 0 ? (
                earlierDetail ? (
                  <Reveal summary={t.earlierBlocked(earlierBlocked)}>
                    {earlierDetail}
                  </Reveal>
                ) : (
                  <p data-testid="earlier-blocked" className="mt-1 text-sm text-muted">
                    {t.earlierBlocked(earlierBlocked)}
                  </p>
                )
              ) : null}
              {row.record && extra?.detail ? (
                <div className="mt-1 flex flex-col gap-1">{extra.detail}</div>
              ) : null}
              {row.record ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1">
                  <LedgerChip record={row.record.ledger} />
                  <ProofButton
                    issueId={issueId}
                    recordId={row.record.id}
                    label={title}
                    ledger={row.record.ledger}
                    withDocument={withDocument}
                    reportId={issueId}
                  />
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The trail as anyone may see it: each step, the role that took it, the time
 * and the proof. No amount, no supplier, no document and no person's name is
 * passed to this component, so none can be shown.
 */
export function PublicTrail({
  issueId,
  steps,
  timeline,
  status,
  heading = true,
}: {
  issueId: string;
  steps: PublicTrailStep[];
  timeline: TimelineEvent[];
  status: IssueStatus;
  heading?: boolean;
}) {
  const m = useMessages();
  const t = m.procurement.trail;
  const rows = buildTrailRows({ steps, timeline, status });
  const earlier = invoiceOutcomes(steps)
    .slice(0, -1)
    .filter((outcome) => outcome === "blocked").length;
  const match = rows.find((row) => row.key === "match");
  return (
    <section
      data-testid="public-trail"
      aria-labelledby={heading ? "public-trail-title" : undefined}
      aria-label={heading ? undefined : t.publicTitle}
      className="flex flex-col gap-4"
    >
      {heading ? (
        <div>
          <h2 id="public-trail-title" className="text-xl">
            {t.publicTitle}
          </h2>
          <p className="mt-1 text-muted">{t.publicIntro}</p>
        </div>
      ) : null}
      <TrailList
        issueId={issueId}
        rows={rows}
        financeDocuments={NO_DOCUMENTS}
        earlierBlocked={earlier}
        sentences={{
          // Blocked or matched comes from the step's `outcome`, never from its words.
          match:
            match?.state === "blocked"
              ? t.matchBlocked
              : steps.findLast((step) => step.type === "match_recorded")?.outcome ===
                  "matched"
                ? t.matchDone
                : undefined,
          verified: status === "disputed" ? t.disputed : undefined,
          release: t.releaseDone,
        }}
      />
    </section>
  );
}

/**
 * The trail for signed-in people who may read it: the same eight rows, with
 * the named person on each step and one line of detail. Amounts appear only
 * when the trail carries them (`pricesVisible`); for the receiving officer,
 * the school and the reviewer it never does.
 */
export function StaffTrail({
  trail,
  timeline,
  status,
  heading = true,
}: {
  trail: MoneyTrail;
  timeline: TimelineEvent[];
  status: IssueStatus;
  heading?: boolean;
}) {
  const m = useMessages();
  const t = m.procurement.trail;
  const o = m.procurement.order;
  const invoice = trail.invoices.at(-1);
  const outcome = invoice?.match?.outcome ?? null;
  const rows = buildTrailRows({
    steps: trail.steps,
    timeline,
    status,
    matchOutcome: outcome,
  });
  const earlier = trail.invoices
    .slice(0, -1)
    .filter((earlierInvoice) => earlierInvoice.match?.outcome === "blocked");

  const nameOf = (key: TrailRowKey) => {
    const record = rows.find((row) => row.key === key)?.record;
    return trail.steps.find((step) => step.eventId === record?.id)?.actorName ?? null;
  };
  const ordered = trail.order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const arrived = trail.receipts
    .filter((receipt) => receipt.orderVersion === trail.order.version)
    .flatMap((receipt) => receipt.lines)
    .reduce((sum, line) => sum + line.quantity, 0);

  const extras: Partial<Record<TrailRowKey, RowExtras>> = {
    order: {
      name: nameOf("order"),
      detail: (
        <>
          <p data-testid="trail-order-summary" className="tabular-nums">
            {trail.order.totalCents !== undefined
              ? o.summaryWithTotal(
                  trail.order.lines.length,
                  formatRand(trail.order.totalCents),
                )
              : o.summaryWithItems(trail.order.lines.length, ordered)}
          </p>
          <details>
            <summary className={link}>{o.see}</summary>
            <div className="mt-2">
              <OrderDetails order={trail.order} />
            </div>
          </details>
        </>
      ),
    },
    acknowledged: { name: nameOf("acknowledged") },
    invoice: {
      name: nameOf("invoice"),
      detail: invoice ? (
        <>
          <p className="tabular-nums">
            {m.procurement.match.invoice(invoice.invoiceNumber)}
            {invoice.totalCents !== undefined
              ? ` · ${formatRand(invoice.totalCents)}`
              : ""}
          </p>
          {invoice.aiDrafted ? <p className="text-sm text-muted">{t.aiDrafted}</p> : null}
        </>
      ) : null,
    },
    delivery: {
      name: nameOf("delivery"),
      detail: <p className="tabular-nums">{t.arrived(arrived, ordered)}</p>,
    },
    match: {
      detail:
        invoice?.match && invoice.match.outcome === "blocked" ? (
          <Reveal summary={t.reasons(invoice.match.reasons.length)}>
            <MatchResult
              issueId={trail.issueId}
              match={invoice.match}
              waitingForSupplier
            />
          </Reveal>
        ) : null,
    },
    release: { name: nameOf("release") },
  };

  return (
    <section
      data-testid="staff-trail"
      data-prices={trail.pricesVisible ? "visible" : "hidden"}
      aria-labelledby={heading ? "staff-trail-title" : undefined}
      aria-label={heading ? undefined : t.staffTitle}
      className="flex flex-col gap-4"
    >
      {heading ? (
        <h2 id="staff-trail-title" className="text-xl">
          {t.staffTitle}
        </h2>
      ) : null}
      <TrailList
        issueId={trail.issueId}
        rows={rows}
        financeDocuments={trail.pricesVisible ? FINANCE_DOCUMENTS : PRICELESS_DOCUMENTS}
        extras={extras}
        earlierBlocked={earlier.length}
        earlierDetail={
          earlier.length > 0
            ? earlier.map((earlierInvoice) => (
                <div key={earlierInvoice.id}>
                  <p className="font-semibold tabular-nums">
                    {m.procurement.match.invoice(earlierInvoice.invoiceNumber)}
                    {earlierInvoice.totalCents !== undefined
                      ? ` · ${formatRand(earlierInvoice.totalCents)}`
                      : ""}
                  </p>
                  <MatchResult
                    issueId={trail.issueId}
                    match={earlierInvoice.match!}
                    showNext={false}
                  />
                </div>
              ))
            : undefined
        }
        sentences={{
          match:
            outcome === "blocked"
              ? t.matchBlocked
              : outcome === "matched"
                ? t.matchDone
                : undefined,
          verified: status === "disputed" ? t.disputed : undefined,
          release: t.releaseDone,
        }}
      />
    </section>
  );
}
