import type {
  ActorRole,
  IssueStatus,
  LedgerRecord,
  PublicTrailStep,
  TimelineEvent,
  TimelineEventType,
} from "@/data/types";
import type { Messages } from "@/i18n";
import type { TrailRowKey } from "@/i18n/en-procurement";

/**
 * The trail of a case as one fixed list of eight rows: the report, then the
 * seven steps. The order never changes, even when the delivery is recorded
 * before the invoice. Each row is done, waiting or blocked.
 */
export type TrailRowState = "done" | "waiting" | "blocked";

export interface TrailRow {
  key: TrailRowKey;
  state: TrailRowState;
  /** The first waiting row, unless a row is blocked: that one must be dealt with first. */
  next: boolean;
  /** Who acts on this row, as the public reads it. */
  actor: ActorRole;
  /** The record behind a done or blocked row. Null while the row waits. */
  record: {
    id: string;
    type: TimelineEventType;
    occurredAt: string;
    ledger: LedgerRecord;
  } | null;
}

export const TRAIL_ROW_ORDER: readonly TrailRowKey[] = [
  "reported",
  "order",
  "acknowledged",
  "invoice",
  "delivery",
  "match",
  "verified",
  "release",
];

const ROW_ACTOR: Record<TrailRowKey, ActorRole> = {
  reported: "community",
  order: "buyer",
  acknowledged: "supplier",
  invoice: "supplier",
  delivery: "receiving_officer",
  match: "system",
  verified: "reviewer",
  release: "payment_approver",
};

const STEP_ROW: Partial<Record<PublicTrailStep["type"], TrailRowKey>> = {
  work_order_approved: "order",
  work_order_acknowledged: "acknowledged",
  invoice_submitted: "invoice",
  goods_receipt_recorded: "delivery",
  match_recorded: "match",
  release_authorised: "release",
};

export type MatchOutcome = NonNullable<PublicTrailStep["outcome"]>;

/**
 * The outcome of each invoice, oldest first, read from the steps alone: the
 * last rule-engine step after an invoice and before the next one. Null while
 * the engine has not run, or when the step does not say.
 */
export function invoiceOutcomes(steps: PublicTrailStep[]): (MatchOutcome | null)[] {
  const outcomes: (MatchOutcome | null)[] = [];
  for (const step of steps) {
    if (step.type === "invoice_submitted") outcomes.push(null);
    else if (step.type === "match_recorded" && outcomes.length > 0) {
      outcomes[outcomes.length - 1] = step.outcome ?? null;
    }
  }
  return outcomes;
}

export interface TrailInput {
  /** The procurement steps, oldest first. */
  steps: PublicTrailStep[];
  /** The report's own timeline, for the first row and the reviewer's row. */
  timeline: TimelineEvent[];
  status: IssueStatus;
  /**
   * Which way the latest invoice went. Omit to read it from the steps
   * (`outcome` on the rule-engine step), which is all the public has.
   */
  matchOutcome?: MatchOutcome | null;
}

export function buildTrailRows(input: TrailInput): TrailRow[] {
  const steps = [...input.steps].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const latest: Partial<Record<TrailRowKey, PublicTrailStep>> = {};
  for (const step of steps) {
    const key = STEP_ROW[step.type];
    if (key) latest[key] = step;
  }
  // A new order version must be acknowledged again.
  if (
    latest.order &&
    latest.acknowledged &&
    latest.acknowledged.occurredAt < latest.order.occurredAt
  ) {
    delete latest.acknowledged;
  }

  const lastEvent = (type: TimelineEventType) =>
    [...input.timeline]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .findLast((event) => event.type === type);
  const fromEvent = (event: TimelineEvent | undefined): TrailRow["record"] =>
    event
      ? {
          id: event.id,
          type: event.type,
          occurredAt: event.occurredAt,
          ledger: event.ledger,
        }
      : null;
  const fromStep = (step: PublicTrailStep | undefined): TrailRow["record"] =>
    step
      ? {
          id: step.eventId,
          type: step.type,
          occurredAt: step.occurredAt,
          ledger: step.ledger,
        }
      : null;

  const matchOutcome =
    input.matchOutcome !== undefined
      ? input.matchOutcome
      : (invoiceOutcomes(steps).at(-1) ?? null);

  const rows = TRAIL_ROW_ORDER.map((key): TrailRow => {
    const row = (state: TrailRowState, record: TrailRow["record"]): TrailRow => ({
      key,
      state,
      next: false,
      actor: ROW_ACTOR[key],
      record,
    });
    if (key === "reported") return row("done", fromEvent(lastEvent("reported")));
    if (key === "verified") {
      if (input.status === "independently_verified") {
        return row("done", fromEvent(lastEvent("verified")));
      }
      if (input.status === "disputed") {
        return row("blocked", fromEvent(lastEvent("disputed")));
      }
      return row("waiting", null);
    }
    const step = latest[key];
    if (!step) return row("waiting", null);
    if (key === "match" && matchOutcome === "blocked") {
      return row("blocked", fromStep(step));
    }
    return row("done", fromStep(step));
  });

  if (!rows.some((row) => row.state === "blocked")) {
    const first = rows.find((row) => row.state === "waiting");
    if (first) first.next = true;
  }
  return rows;
}

/**
 * When a step happened, for the trail: relative while it is under a day old,
 * otherwise the day and the time ("20 Nov, 09:14").
 */
export function trailTime(iso: string, m: Messages, now: number = Date.now()): string {
  const t = m.procurement.trail;
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes >= 0 && minutes < 1) return t.justNow;
  if (minutes >= 0 && minutes < 60) return t.minutesAgo(minutes);
  if (minutes >= 0 && minutes < 24 * 60) return t.hoursAgo(Math.floor(minutes / 60));
  return dayAndTime.format(new Date(iso));
}

const dayAndTime = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
