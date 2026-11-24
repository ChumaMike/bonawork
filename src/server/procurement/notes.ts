/**
 * The words the public reads about a finance step.
 *
 * Case-event notes are shown on public pages, so a finance event never
 * stores free text: its note is one of the constants below, written by code.
 * They carry no amount, no supplier name and no person's name, and they never
 * say that money moved.
 *
 * This file touches no table. The public view imports it.
 */
import {
  FINANCE_CASE_EVENT_TYPES,
  type CaseEventType,
  type FinanceCaseEventType,
  type MatchOutcome,
  type TrailActor,
  type UserRole,
} from "@/shared";

/** The sentence for each finance step. */
export const FINANCE_EVENT_NOTE: Record<FinanceCaseEventType, string> = {
  work_order_approved: "A work order for this repair was approved.",
  work_order_acknowledged: "The supplier acknowledged the work order.",
  invoice_submitted: "The supplier submitted an invoice.",
  goods_receipt_recorded: "The school recorded what was delivered.",
  match_recorded:
    "The rule engine compared the invoice with the work order and the delivery record.",
  payment_dispute_opened: "A query about the invoice was opened.",
  payment_dispute_closed: "The query about the invoice was closed.",
  release_authorised:
    "A release instruction was authorised. BonaWork records the decision; it moves no money.",
};

/** A match event says which way the rule engine decided. The outcome is on the ledger too. */
export const MATCH_EVENT_NOTE: Record<MatchOutcome, string> = {
  matched:
    "The rule engine compared the invoice with the work order and the delivery record: they agree.",
  blocked:
    "The rule engine compared the invoice with the work order and the delivery record: they do not agree, so the invoice is blocked.",
};

const ALLOWED_NOTES: Record<FinanceCaseEventType, readonly string[]> = {
  work_order_approved: [FINANCE_EVENT_NOTE.work_order_approved],
  work_order_acknowledged: [FINANCE_EVENT_NOTE.work_order_acknowledged],
  invoice_submitted: [FINANCE_EVENT_NOTE.invoice_submitted],
  goods_receipt_recorded: [FINANCE_EVENT_NOTE.goods_receipt_recorded],
  match_recorded: [
    FINANCE_EVENT_NOTE.match_recorded,
    MATCH_EVENT_NOTE.matched,
    MATCH_EVENT_NOTE.blocked,
  ],
  payment_dispute_opened: [FINANCE_EVENT_NOTE.payment_dispute_opened],
  payment_dispute_closed: [FINANCE_EVENT_NOTE.payment_dispute_closed],
  release_authorised: [FINANCE_EVENT_NOTE.release_authorised],
};

/**
 * Which way a match event went, read from its note constant. This is how the
 * public trail knows the outcome without reading the match table.
 */
export function matchOutcomeOfNote(note: string): MatchOutcome | undefined {
  if (note === MATCH_EVENT_NOTE.matched) return "matched";
  if (note === MATCH_EVENT_NOTE.blocked) return "blocked";
  return undefined;
}

/** Every sentence a finance step may show. Tests check responses against this list. */
export const FINANCE_NOTE_CONSTANTS: readonly string[] = [
  ...new Set(Object.values(ALLOWED_NOTES).flat()),
];

export function isFinanceEventType(type: CaseEventType): type is FinanceCaseEventType {
  return (FINANCE_CASE_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * The note to show for a finance event. The stored note is used only when it
 * is one of the constants for that event type; anything else is replaced by
 * the constant, so text that was never meant to be public cannot get out
 * through this field even if a row is written by hand.
 */
export function financeNote(type: FinanceCaseEventType, stored: string): string {
  return ALLOWED_NOTES[type].includes(stored) ? stored : FINANCE_EVENT_NOTE[type];
}

/**
 * Who a finance step is attributed to: a role, never a person. The role comes
 * from the event type, so the public label is right whatever the row says.
 * The rule engine is `system`.
 */
export function financeActor(
  type: FinanceCaseEventType,
  actorRole: UserRole,
): TrailActor {
  switch (type) {
    case "work_order_approved":
      return "buyer";
    case "work_order_acknowledged":
    case "invoice_submitted":
      return "supplier";
    case "goods_receipt_recorded":
      return "receiving_officer";
    case "match_recorded":
      return "system";
    case "release_authorised":
      return "payment_approver";
    case "payment_dispute_opened":
    case "payment_dispute_closed":
      // A query is opened and closed by the buyer or the receiving officer.
      return actorRole === "buyer" || actorRole === "receiving_officer"
        ? actorRole
        : "system";
  }
}
