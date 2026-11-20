import type { MatchReason } from "./types";

/**
 * The code-written plain-language explanation of why an invoice was blocked:
 * one sentence per reason, in the order given. This is the text shown when AI
 * is off, and the facts any AI rewording must stick to.
 */
export function ruleExplanation(reasons: readonly MatchReason[]): string {
  void reasons;
  throw new Error("not implemented");
}
