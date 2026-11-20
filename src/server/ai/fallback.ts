/**
 * Deterministic Bona AI answer: keyword matching over database records.
 * Used when no AI Gateway key is configured, and whenever the provider
 * fails, times out or returns something unusable. The text says so.
 */
import type {
  AssistantAction,
  AssistantMessage,
  IssueSummary,
  School,
} from "@/data/types";

export const PROBLEM_WORDS =
  /toilet|water|tap|leak|roof|window|fence|wire|electric|desk|broken|blocked|unsafe|danger|pit|door|ceiling|report|problem|flush|sink|basin/i;

export interface Grounding {
  question: string;
  /** Issues already matched to the question (same search as `/api/issues/similar`). */
  issues: IssueSummary[];
  /** The school the question appears to be about, if any. */
  school: School | null;
  /** A reference the question quotes, and the issue it names if it exists. */
  reference: string | null;
  referenced: IssueSummary | null;
}

export const newMessageId = () =>
  `assistant-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

export const reportAction = (school: School | null, text?: string): AssistantAction => ({
  label: "Report it",
  href: `/report?${new URLSearchParams({
    ...(school ? { schoolId: school.id } : {}),
    ...(text ? { text } : {}),
  })}`,
});

export const affectedAction = (issue: IssueSummary): AssistantAction => ({
  label: "I'm affected too",
  href: `/issues/${issue.id}`,
});

const UNAVAILABLE =
  "Bona AI is unavailable right now, so this answer is a keyword match on the public record, not a written reply.";

export function fallbackAnswer(g: Grounding): AssistantMessage {
  const text = g.question.toLowerCase();
  const reply = (message: Omit<AssistantMessage, "id" | "role">): AssistantMessage => ({
    id: newMessageId(),
    role: "assistant",
    ...message,
  });

  if (g.reference) {
    return g.referenced
      ? reply({
          text: `${UNAVAILABLE} Report ${g.reference} is on record — open it to see every update and who is responsible.`,
          issues: [g.referenced],
          actions: [{ label: "Open the report", href: `/issues/${g.referenced.id}` }],
        })
      : reply({
          text: `${UNAVAILABLE} No report with the reference ${g.reference} was found. Check the number on your receipt.`,
          actions: [{ label: "Track a report", href: "/track" }],
        });
  }

  if (PROBLEM_WORDS.test(text) || g.issues.length > 0) {
    return g.issues.length > 0
      ? reply({
          text: `${UNAVAILABLE} These existing reports share words with your question. If one of them is your problem, open it and tap "I'm affected too" — that is quicker and makes the report stronger. If yours is different, report it as new.`,
          issues: g.issues,
          school: g.school ?? undefined,
          actions: [affectedAction(g.issues[0]), reportAction(g.school, g.question)],
        })
      : reply({
          text: `${UNAVAILABLE} No existing report matched these words. You can report the problem as new; it takes about three minutes.`,
          school: g.school ?? undefined,
          actions: [reportAction(g.school, g.question)],
        });
  }

  if (g.school) {
    const open = g.issues.length;
    return reply({
      text: `${UNAVAILABLE} ${g.school.name} is in ${g.school.town}${
        g.school.participation === "participating"
          ? " and takes part in Bona Chain, so the school responds to reports here."
          : ". It has been invited but does not take part yet; reports still stay on the public record."
      }${open ? ` ${open} open public ${open === 1 ? "issue is" : "issues are"} listed.` : ""}`,
      school: g.school,
      issues: g.issues.slice(0, 2),
      actions: [{ label: "See the school", href: `/schools/${g.school.id}` }],
    });
  }

  if (/verif|prove|proof|blockchain|avalanche|fingerprint|tamper/.test(text)) {
    return reply({
      text: `${UNAVAILABLE} Every photo or document gets a fingerprint (a SHA-256 digest) that is recorded on the ledger. Anyone holding the original file can check it was never altered; the file itself stays private.`,
      actions: [{ label: "Check a file", href: "/verify" }],
    });
  }

  if (/track|status|follow|progress|update/.test(text)) {
    return reply({
      text: `${UNAVAILABLE} You can follow a report with the reference on your receipt. It looks like BB-2026-000123.`,
      actions: [{ label: "Track a report", href: "/track" }],
    });
  }

  return reply({
    text: `${UNAVAILABLE} I can help you find a school, check whether a problem has already been reported, report a new problem, or follow a report.`,
    actions: [
      { label: "Find a school", href: "/schools" },
      { label: "See public issues", href: "/issues" },
      { label: "Report a problem", href: "/report" },
    ],
  });
}
