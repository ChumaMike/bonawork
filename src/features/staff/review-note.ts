import type { Messages } from "@/i18n";

/** A reviewer's answers to the three checks, in order. Null until answered. */
export type CheckAnswers = readonly (boolean | null)[];

export function allAnswered(answers: CheckAnswers): answers is readonly boolean[] {
  return answers.every((answer) => answer !== null);
}

/**
 * The three answers as one plain line, for example
 * "At the school: yes. Repair matches the claim: no. Safe to use: no."
 */
export function checksLine(answers: readonly boolean[], r: Messages["reviewer"]): string {
  return r.checks
    .map((check, index) => r.checkAnswer(check.short, answers[index]))
    .join(" ");
}

/**
 * The note that is sent with a decision: the reviewer's own words, then the
 * three answers as the last line. The checks are guidance for the visit, not
 * a separate record: this note is the only place they are kept.
 */
export function composeReviewNote(
  note: string,
  answers: readonly boolean[],
  r: Messages["reviewer"],
): string {
  return `${note.trim()}\n${checksLine(answers, r)}`;
}
