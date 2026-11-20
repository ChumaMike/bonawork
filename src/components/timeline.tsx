"use client";

import type { EvidenceItem, TimelineEvent, TimelineEventType } from "@/data/types";
import { useMessages } from "@/i18n";
import { formatDate, timeAgo } from "@/lib/format";
import { LedgerChip } from "./ledger-state";
import { ProofButton } from "./proof/proof-button";
import { cn } from "./ui/cn";
import { Icon, type IconName } from "./ui/icon";

const EVENT_STYLE: Record<TimelineEventType, { icon: IconName; tone: string }> = {
  reported: { icon: "flag", tone: "bg-st-reported-soft text-st-reported" },
  assessment_started: { icon: "search", tone: "bg-st-assess-soft text-st-assess" },
  progress_recorded: { icon: "wrench", tone: "bg-st-address-soft text-st-address" },
  interim_protection: { icon: "shield", tone: "bg-brand-soft text-brand-strong" },
  repair_claimed: { icon: "clock", tone: "bg-st-claimed-soft text-st-claimed" },
  verified: { icon: "shieldCheck", tone: "bg-st-verified-soft text-st-verified" },
  disputed: { icon: "alert", tone: "bg-st-disputed-soft text-st-disputed" },
  declined: { icon: "ban", tone: "bg-st-declined-soft text-st-declined" },
  evidence_added: { icon: "file", tone: "bg-sunken text-muted" },
  work_order_approved: { icon: "file", tone: "bg-brand-soft text-brand-strong" },
  work_order_acknowledged: { icon: "check", tone: "bg-brand-soft text-brand-strong" },
  invoice_submitted: { icon: "send", tone: "bg-brand-soft text-brand-strong" },
  goods_receipt_recorded: { icon: "cube", tone: "bg-brand-soft text-brand-strong" },
  match_recorded: { icon: "filter", tone: "bg-sunken text-muted" },
  payment_dispute_opened: { icon: "alert", tone: "bg-st-disputed-soft text-st-disputed" },
  payment_dispute_closed: { icon: "check", tone: "bg-sunken text-muted" },
  release_authorised: { icon: "lock", tone: "bg-brand-soft text-brand-strong" },
};

/**
 * Entries anchored as a salted commitment document, which the verifier needs
 * too. The procurement steps are anchored the same way, but they are not in
 * this list: their documents hold amounts and names, so this public timeline
 * never offers one. People who may read them get them from the staff trail.
 */
const HAS_DOCUMENT = new Set<TimelineEventType>([
  "reported",
  "interim_protection",
  "repair_claimed",
  "verified",
  "disputed",
]);

/**
 * The procurement steps. Anyone may see that a step happened, which role took
 * it, when, and its proof on the ledger. Nothing else is shown for them here:
 * no note, no document, no person's name and no amount.
 */
const FINANCE_STEPS = new Set<TimelineEventType>([
  "work_order_approved",
  "work_order_acknowledged",
  "invoice_submitted",
  "goods_receipt_recorded",
  "match_recorded",
  "payment_dispute_opened",
  "payment_dispute_closed",
  "release_authorised",
]);

/**
 * Pairs each "Evidence added" entry with one evidence item added at the same
 * moment. Several files sent together share a timestamp, so each item is used
 * once, oldest entry and lowest version first: two school photos read
 * "Evidence 4" and "Evidence 5", not "Evidence 4" twice.
 */
export function matchEvidence(
  events: TimelineEvent[],
  evidence: EvidenceItem[],
): Map<string, EvidenceItem> {
  const unused = [...evidence].sort((a, b) => a.version - b.version);
  const matched = new Map<string, EvidenceItem>();
  const added = events
    .filter((event) => event.type === "evidence_added")
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  for (const event of added) {
    const at = unused.findIndex((item) => item.addedAt === event.occurredAt);
    if (at === -1) continue;
    matched.set(event.id, unused[at]);
    unused.splice(at, 1);
  }
  return matched;
}

/** An issue's history, newest first. */
export function Timeline({
  issueId,
  events,
  evidence = [],
  onSeeEvidence,
}: {
  issueId: string;
  events: TimelineEvent[];
  /** The issue's evidence, so an "Evidence added" entry can point at its item. */
  evidence?: EvidenceItem[];
  /** When the evidence is on another tab: called instead of following the in-page link. */
  onSeeEvidence?: (evidenceId?: string) => void;
}) {
  const m = useMessages();
  const ordered = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const itemFor = matchEvidence(events, evidence);
  return (
    <ol className="flex flex-col">
      {ordered.map((event, index) => {
        const style = EVENT_STYLE[event.type];
        const last = index === ordered.length - 1;
        if (event.type === "evidence_added") {
          // The evidence list below carries the detail and the receipt, so this
          // is one line. It names the item when the two records line up in time.
          const item = itemFor.get(event.id);
          return (
            <li key={event.id} data-testid="timeline-evidence" className="flex gap-3">
              <div className="flex w-10 flex-col items-center">
                <span
                  className={cn(
                    "mt-1.5 flex size-6 items-center justify-center rounded-full",
                    style.tone,
                  )}
                >
                  <Icon name={style.icon} className="size-3.5" />
                </span>
                {last ? null : (
                  <span className="w-0.5 flex-1 bg-line" aria-hidden="true" />
                )}
              </div>
              <p className="min-w-0 flex-1 pt-1.5 pb-5 text-sm text-muted">
                <span className="font-semibold text-ink">{m.event[event.type]}</span> ·{" "}
                {m.actor[event.actor]} ·{" "}
                <time dateTime={event.occurredAt} title={formatDate(event.occurredAt)}>
                  {timeAgo(event.occurredAt, m)}
                </time>{" "}
                ·{" "}
                <a
                  href={item ? `#evidence-${item.id}` : "#evidence-title"}
                  onClick={
                    onSeeEvidence
                      ? (click) => {
                          click.preventDefault();
                          onSeeEvidence(item?.id);
                        }
                      : undefined
                  }
                  className="font-semibold text-brand-strong underline underline-offset-4"
                >
                  {item ? m.issue.evidenceVersion(item.version) : m.issue.seeEvidence}
                </a>
              </p>
            </li>
          );
        }
        const finance = FINANCE_STEPS.has(event.type);
        return (
          <li
            key={event.id}
            data-testid={finance ? "timeline-finance" : undefined}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-full",
                  style.tone,
                )}
              >
                <Icon name={style.icon} />
              </span>
              {last ? null : <span className="w-0.5 flex-1 bg-line" aria-hidden="true" />}
            </div>
            <div className="min-w-0 flex-1 pb-6">
              <p className="font-semibold">{m.event[event.type]}</p>
              <p className="text-sm text-muted">
                {event.actor === "system" && finance
                  ? m.procurement.rules
                  : m.actor[event.actor]}{" "}
                ·{" "}
                <time dateTime={event.occurredAt} title={formatDate(event.occurredAt)}>
                  {timeAgo(event.occurredAt, m)}
                </time>
              </p>
              {finance ? null : <p className="mt-1.5">{event.note}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
                <LedgerChip record={event.ledger} />
                <ProofButton
                  issueId={issueId}
                  recordId={event.id}
                  label={m.event[event.type]}
                  ledger={event.ledger}
                  withDocument={HAS_DOCUMENT.has(event.type)}
                  reportId={issueId}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
