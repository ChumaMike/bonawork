/**
 * DEVELOPMENT FIXTURE for Bona AI.
 *
 * Scripted, keyword-matched answers so the chat screen can be designed and
 * tested before the AI service exists. This is not a language model and the
 * interface says so. Replace by implementing `BonaApi.askAssistant`.
 */
import type { AssistantMessage, IssueSummary, School } from "../types";

const PROBLEM_WORDS =
  /toilet|water|tap|leak|roof|window|fence|wire|electric|desk|broken|blocked|unsafe|danger|pit|door|ceiling|report|problem/i;

let counter = 0;
const nextId = () => `assistant-${Date.now()}-${counter++}`;

export function answerQuestion(
  question: string,
  issues: IssueSummary[],
  schools: School[],
): AssistantMessage {
  const text = question.toLowerCase();
  const reply = (message: Omit<AssistantMessage, "id" | "role">): AssistantMessage => ({
    id: nextId(),
    role: "assistant",
    ...message,
  });

  const reference = question.toUpperCase().match(/BB-\d{4}-\d{6}/)?.[0];
  if (reference) {
    const issue = issues.find((candidate) => candidate.reference === reference);
    return issue
      ? reply({
          text: `Here is report ${reference}. Open it to see every update and who is responsible.`,
          issues: [issue],
        })
      : reply({
          text: `I could not find a report with the reference ${reference}. Please check the number on your receipt.`,
          actions: [{ label: "Track a report", href: "/track" }],
        });
  }

  const school = schools.find((candidate) =>
    candidate.name
      .toLowerCase()
      .split(/[\s-]+/)
      .filter(
        (part) => part.length > 4 && !["primary", "secondary", "school"].includes(part),
      )
      .some((part) => text.includes(part)),
  );

  if (PROBLEM_WORDS.test(text)) {
    const keywords = text.split(/[^a-z]+/).filter((word) => word.length > 3);
    const similar = issues
      .filter((issue) => !school || issue.schoolId === school.id)
      .filter((issue) =>
        keywords.some((word) =>
          issue.title.toLowerCase().includes(word.replace(/s$/, "")),
        ),
      )
      .slice(0, 3);
    const reportHref = `/report?${new URLSearchParams({
      ...(school ? { school: school.id } : {}),
      text: question,
    })}`;

    return similar.length > 0
      ? reply({
          text: "This may already be reported. If one of these is your problem, open it and tap “I'm affected too” — that is quicker and makes the report stronger. If yours is different, report it as new.",
          issues: similar,
          actions: [{ label: "Mine is different — report it", href: reportHref }],
        })
      : reply({
          text: "I could not find an existing report like this. I can take you through reporting it, one step at a time. It takes about three minutes.",
          actions: [{ label: "Start a report", href: reportHref }],
        });
  }

  if (school) {
    const open = issues.filter(
      (issue) =>
        issue.schoolId === school.id && issue.status !== "independently_verified",
    );
    return reply({
      text:
        school.participation === "participating"
          ? `${school.name} is in ${school.town} and takes part in BonaWork, so the school responds to reports here. It has ${open.length} open public ${open.length === 1 ? "issue" : "issues"}.`
          : `${school.name} is in ${school.town}. It has been invited but does not take part yet. You can still report a problem and it stays on the public record.`,
      school,
      issues: open.slice(0, 2),
    });
  }

  if (/verif|prove|proof|blockchain|avalanche|fingerprint|tamper/.test(text)) {
    return reply({
      text: "Every photo or document gets a fingerprint — a short code that changes if even one dot in the file changes. BonaWork is designed to record that fingerprint on Solana, a public blockchain. Anyone holding the original file can then check that it was never altered. Your file itself stays private.",
      actions: [{ label: "Check a file", href: "/verify" }],
    });
  }

  if (/track|status|follow|progress|update/.test(text)) {
    return reply({
      text: "You can follow a report with the reference number on your receipt. It looks like BB-2026-000123.",
      actions: [{ label: "Track a report", href: "/track" }],
    });
  }

  return reply({
    text: "I can help you find a school, check whether a problem has already been reported, report a new problem, or follow a report. What would you like to do?",
    actions: [
      { label: "Find a school", href: "/schools" },
      { label: "See public issues", href: "/issues" },
      { label: "Report a problem", href: "/report" },
    ],
  });
}
