"use client";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Audience } from "@/data/audience";
import type { Issue, IssueStatus } from "@/data/types";
import { useMessages } from "@/i18n";

/** A problem that is still open: nobody has claimed, checked or declined a repair. */
const STILL_OPEN = new Set<IssueStatus>([
  "reported",
  "under_assessment",
  "being_addressed",
]);

/**
 * Whether a case still waits for someone to fund it: the problem is open and
 * no work order has been approved. The public trail holds the procurement
 * steps, so a case without a "work order approved" step has no order.
 */
export function needsFunder(issue: Pick<Issue, "status" | "publicTrail">): boolean {
  const hasOrder = (issue.publicTrail ?? []).some(
    (step) => step.type === "work_order_approved",
  );
  return STILL_OPEN.has(issue.status) && !hasOrder;
}

/** Where a funder writes the work order for a case. */
const funderCase = (issueId: string) => `/buyer?case=${issueId}`;

/**
 * Where "Fund this repair" leads. A signed-in funder goes straight to the
 * case in their workspace. Everyone else signs in first, and lands on the
 * same case afterwards.
 */
export function fundRepairHref(issueId: string, audience: Audience): string {
  if (audience.role === "buyer") return funderCase(issueId);
  return `/sign-in?next=${encodeURIComponent(funderCase(issueId))}`;
}

/**
 * The way in for someone who can fund a repair, on the public page of a case
 * that has no work order yet. It is a card of its own, apart from "I'm
 * affected too", and only the community and funders see it: the other staff
 * roles have no part in funding.
 */
export function FundRepair({
  issue,
  audience,
}: {
  issue: Pick<Issue, "id" | "status" | "publicTrail">;
  audience: Audience;
}) {
  const m = useMessages();
  const f = m.issue.fund;
  if (audience.status !== "ready" || !needsFunder(issue)) return null;
  if (!audience.community && audience.role !== "buyer") return null;
  return (
    <Card data-testid="fund-repair" className="flex flex-col gap-3">
      <h2 className="text-xl">{f.title}</h2>
      <p className="text-[0.95rem] text-muted">{f.body}</p>
      <ButtonLink href={fundRepairHref(issue.id, audience)} className="w-full">
        {f.action}
        <Icon name="arrowRight" className="size-5" />
      </ButtonLink>
      <p className="text-sm text-muted">{f.note}</p>
    </Card>
  );
}
