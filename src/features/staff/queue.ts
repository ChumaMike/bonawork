import type { Issue, IssueStatus, TimelineEvent, TimelineEventType } from "@/data/types";
import type { Messages } from "@/i18n";
import { daysSince, timeAgo } from "@/lib/format";

/** Something a school administrator can record on a report. There is no "verify". */
export type Action = keyof Messages["admin"]["actions"];

/** The groups of the short list, most urgent first. */
export type GroupId = keyof Messages["admin"]["groups"];
export const GROUP_ORDER: readonly GroupId[] = ["reply", "fixing", "review", "closed"];

/**
 * The answers a school may give at each status. `main` are the one or two
 * shown as big buttons; `other` sit behind "Other answers". A school can say
 * a repair is done, but nothing here verifies one: only an independent
 * reviewer can do that.
 */
export const ANSWERS: Record<IssueStatus, { main: Action[]; other: Action[] }> = {
  // Only what the backend accepts from each status (STATUS_TRANSITIONS in
  // src/shared/domain.ts): a new report must be answered before anything else,
  // and work that is already under way can only be claimed done or made safe.
  reported: { main: ["assess", "decline"], other: [] },
  under_assessment: { main: ["progress", "claim"], other: ["protect", "decline"] },
  being_addressed: { main: ["claim"], other: ["protect"] },
  disputed: { main: ["progress", "claim"], other: ["protect"] },
  repair_claimed: { main: [], other: [] },
  independently_verified: { main: [], other: [] },
  declined: { main: [], other: [] },
};

const GROUP_OF: Record<IssueStatus, GroupId> = {
  reported: "reply",
  disputed: "reply",
  under_assessment: "fixing",
  being_addressed: "fixing",
  repair_claimed: "review",
  independently_verified: "closed",
  declined: "closed",
};

/** Reports in this group wait for the school: a new report, or a repair a reviewer disputed. */
export function needsReply(status: IssueStatus): boolean {
  return GROUP_OF[status] === "reply";
}

/** A new report with no reply for this many days is late. */
export const NO_RESPONSE_DAYS = 3;
/** This many people affected, with nothing recorded to keep them safe, is urgent. */
export const MANY_AFFECTED = 20;

export interface QueueRow {
  issue: Issue;
  /** The one line under the title: how long it has waited, or where it stands. */
  line: string;
  /** Late or urgent: drawn in red with an icon. */
  late: boolean;
}

/** The most recent timeline event of one of these types. */
export function lastEvent(
  issue: Issue,
  ...types: TimelineEventType[]
): TimelineEvent | undefined {
  return [...issue.timeline]
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .reverse()
    .find((event) => types.includes(event.type));
}

/** The latest thing the school or district wrote about the work. */
export function lastSchoolUpdate(issue: Issue): TimelineEvent | undefined {
  return lastEvent(
    issue,
    "assessment_started",
    "progress_recorded",
    "interim_protection",
  );
}

/** Many people affected, the work not yet under way, and nothing recorded to keep them safe. */
export function unprotected(issue: Issue): boolean {
  const early = issue.status === "reported" || issue.status === "under_assessment";
  return early && issue.endorsements >= MANY_AFFECTED && !issue.interimProtection;
}

/** How long a report has waited, for the top of its own screen. Null once it is closed. */
export function waitInfo(
  issue: Issue,
  m: Messages,
  now: number = Date.now(),
): { label: string; late: boolean } | null {
  const a = m.admin;
  const days = daysSince(issue.createdAt, now);
  switch (issue.status) {
    case "reported":
      return { label: a.waiting(days), late: days >= NO_RESPONSE_DAYS };
    case "under_assessment":
    case "being_addressed":
    case "disputed":
      return { label: a.openFor(days), late: false };
    case "repair_claimed": {
      const claim = lastEvent(issue, "repair_claimed");
      return {
        label: a.saidFixed(timeAgo(claim?.occurredAt ?? issue.updatedAt, m, now)),
        late: false,
      };
    }
    default:
      return null;
  }
}

export function queueRow(issue: Issue, m: Messages, now: number = Date.now()): QueueRow {
  const a = m.admin;
  switch (issue.status) {
    case "reported": {
      const waited = daysSince(issue.createdAt, now);
      if (waited >= NO_RESPONSE_DAYS)
        return { issue, line: a.waiting(waited), late: true };
      if (unprotected(issue)) return { issue, line: a.reasonNoProtection, late: true };
      return { issue, line: a.waiting(waited), late: false };
    }
    case "disputed":
      return { issue, line: a.reasonDisputed, late: true };
    case "under_assessment":
      if (unprotected(issue)) return { issue, line: a.reasonNoProtection, late: true };
      return { issue, line: lastSchoolUpdate(issue)?.note || a.noUpdateYet, late: false };
    case "being_addressed":
      return { issue, line: lastSchoolUpdate(issue)?.note || a.noUpdateYet, late: false };
    case "repair_claimed": {
      const claim = lastEvent(issue, "repair_claimed");
      const when = timeAgo(claim?.occurredAt ?? issue.updatedAt, m, now);
      return { issue, line: a.saidFixed(when), late: false };
    }
    case "independently_verified":
      return { issue, line: a.lineVerified, late: false };
    case "declined":
      return { issue, line: a.lineDeclined, late: false };
  }
}

/** The school's reports in their groups. Open groups are oldest first; closed is newest first. */
export function groupQueue(
  issues: Issue[],
  m: Messages,
  now: number = Date.now(),
): Record<GroupId, QueueRow[]> {
  const groups: Record<GroupId, QueueRow[]> = {
    reply: [],
    fixing: [],
    review: [],
    closed: [],
  };
  const oldestFirst = [...issues].sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  for (const issue of oldestFirst)
    groups[GROUP_OF[issue.status]].push(queueRow(issue, m, now));
  groups.closed.sort((x, y) => y.issue.updatedAt.localeCompare(x.issue.updatedAt));
  return groups;
}

/**
 * The next report that needs a reply after `currentId`, and how many need
 * one besides the current report. Null when there is no other.
 */
export function nextToReply(
  reply: QueueRow[],
  currentId: string,
): { id: string; more: number } | null {
  const ids = reply.map((row) => row.issue.id);
  const others = ids.filter((id) => id !== currentId);
  if (others.length === 0) return null;
  const at = ids.indexOf(currentId);
  return { id: (at >= 0 ? ids[at + 1] : undefined) ?? others[0], more: others.length };
}
