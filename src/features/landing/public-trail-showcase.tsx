"use client";

import Link from "next/link";
import { LedgerChip } from "@/components/ledger-state";
import { Badge } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import { getApi, type BonaApi } from "@/data/api";
import type { Issue, PublicTrailStep, TimelineEvent } from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import { formatDate } from "@/lib/format";

/** One row: a finance step or a public timeline event, reduced to what may be drawn. */
interface Row {
  key: string;
  type: TimelineEvent["type"];
  actor: TimelineEvent["actor"];
  occurredAt: string;
  ledger: TimelineEvent["ledger"];
  outcome?: PublicTrailStep["outcome"];
}

const fromStep = (step: PublicTrailStep): Row => ({
  key: step.eventId,
  type: step.type,
  actor: step.actor,
  occurredAt: step.occurredAt,
  ledger: step.ledger,
  outcome: step.type === "match_recorded" ? step.outcome : undefined,
});

const fromEvent = (event: TimelineEvent): Row => ({
  key: event.id,
  type: event.type,
  actor: event.actor,
  occurredAt: event.occurredAt,
  ledger: event.ledger,
});

/** The case a showcase belongs to: only what the public issue page already shows. */
export interface ShowcaseCase {
  id: string;
  reference: string;
  schoolName: string;
}

/**
 * One finished case as the public may see it: each step, the role that took
 * it, the time and its proof. Self-contained: it draws only what is in a
 * `PublicTrailStep`, and of that only the type, the role, the time, the match
 * outcome and the proof. It never prints the step's `note`, so no free text
 * can reach the landing page through it. No amounts, supplier names or
 * people's names: a public step does not carry them.
 *
 * Renders nothing when there are no steps.
 */
export function PublicTrailShowcase({
  steps,
  issue,
  around = [],
}: {
  steps: readonly PublicTrailStep[] | null | undefined;
  issue?: ShowcaseCase;
  /**
   * Public timeline events shown in time order among the steps: the report
   * and the independent verification, which are not finance steps.
   */
  around?: readonly TimelineEvent[];
}) {
  const m = useMessages();
  const l = m.landing.showcase;
  if (!steps || steps.length === 0) return null;
  const rows: Row[] = [...steps.map(fromStep), ...around.map(fromEvent)].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt),
  );

  return (
    <section
      aria-labelledby="showcase-title"
      data-testid="public-trail-showcase"
      className="mx-auto w-full max-w-2xl px-4 pb-8 sm:px-6"
    >
      <h2 id="showcase-title" className="text-2xl font-bold tracking-tight">
        {l.title}
      </h2>
      <p className="mt-1 text-muted">{l.intro}</p>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        {issue ? (
          <p className="font-semibold">{l.caseAt(issue.reference, issue.schoolName)}</p>
        ) : null}
        <ol className={cn("flex flex-col", issue && "mt-4")}>
          {rows.map((step, index) => {
            const blocked = step.outcome === "blocked";
            const last = index === rows.length - 1;
            const detail =
              step.type === "match_recorded"
                ? step.outcome === "blocked"
                  ? l.blocked
                  : step.outcome === "matched"
                    ? l.matched
                    : null
                : step.type === "release_authorised"
                  ? l.released
                  : null;
            return (
              <li
                key={step.key}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3"
              >
                <span className="flex flex-col items-center">
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full text-on-brand",
                      blocked ? "bg-danger" : "bg-brand",
                    )}
                  >
                    <Icon name={blocked ? "alert" : "check"} className="size-4" />
                  </span>
                  {last ? null : <span aria-hidden className="w-0.5 grow bg-brand" />}
                </span>
                <div className={last ? "pb-0" : "pb-5"}>
                  <h3 className="leading-snug font-semibold">{m.event[step.type]}</h3>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted">
                    <Badge tone="neutral" className="px-2.5 py-0.5">
                      {m.actor[step.actor]}
                    </Badge>
                    <time dateTime={step.occurredAt}>{formatDate(step.occurredAt)}</time>
                    <LedgerChip record={step.ledger} />
                  </p>
                  {detail ? (
                    <p className={cn("mt-1.5 text-sm", blocked && "text-danger")}>
                      {detail}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {issue ? (
          <Link
            href={`/issues/${issue.id}`}
            className="mt-4 inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-strong underline underline-offset-4"
          >
            {l.open}
            <Icon name="arrowRight" className="size-4" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/** How many verified cases are looked at for one with a finished trail. */
const CANDIDATES = 6;

/**
 * The finished case the landing page shows: the most recently updated
 * independently verified case whose public trail ends in an authorised
 * release. Null when there is none. It reads only the public data layer.
 */
export async function findFinishedCase(
  api: Pick<BonaApi, "listIssues" | "getIssue">,
): Promise<Issue | null> {
  const verified = await api.listIssues({
    status: "independently_verified",
    sort: "recent",
  });
  const cases = await Promise.all(
    verified.slice(0, CANDIDATES).map((summary) => api.getIssue(summary.id)),
  );
  return (
    cases.find((issue) =>
      issue?.publicTrail?.some((step) => step.type === "release_authorised"),
    ) ?? null
  );
}

/**
 * Loads the featured finished case through the data layer and shows its
 * public trail. Nothing is shown while it loads, if loading fails, or if no
 * case has a finished trail: the landing page works without it.
 */
export function FeaturedTrail() {
  const query = useQuery("featured-trail", () => findFinishedCase(getApi()));
  const issue = query.data;
  if (!issue) return null;
  // The report and the independent verification frame the finance steps.
  const around = issue.timeline.filter(
    (event) => event.type === "reported" || event.type === "verified",
  );
  return <PublicTrailShowcase steps={issue.publicTrail} issue={issue} around={around} />;
}
