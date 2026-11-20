"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { SchoolContext } from "@/components/chrome";
import { IssueRow } from "@/components/issue-card";
import { PhotoHeader } from "@/components/media/photo";
import { STATUS_STYLE } from "@/components/status";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Container, LoadError, Loading, NotFound } from "@/components/ui/page";
import { getApi } from "@/data/api";
import { useAudience } from "@/data/audience";
import type { IssueStatus, IssueSummary } from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import { formatDate, timeAgo } from "@/lib/format";
import { ParticipationBadge } from "./school-bits";

type GroupKey = "open" | "awaiting" | "disputed" | "verified" | "declined";

const GROUP_OF: Record<IssueStatus, GroupKey> = {
  reported: "open",
  under_assessment: "open",
  being_addressed: "open",
  repair_claimed: "awaiting",
  disputed: "disputed",
  independently_verified: "verified",
  declined: "declined",
};

/** Reads top to bottom as a story: what is still wrong, what is claimed, what is proven. */
const GROUP_ORDER: GroupKey[] = ["open", "awaiting", "disputed", "verified", "declined"];

function groupIssues(issues: IssueSummary[]) {
  const groups = new Map<GroupKey, IssueSummary[]>();
  for (const issue of issues) {
    const key = GROUP_OF[issue.status];
    groups.set(key, [...(groups.get(key) ?? []), issue]);
  }
  return GROUP_ORDER.filter((key) => groups.has(key)).map((key) => ({
    key,
    issues: groups.get(key)!,
  }));
}

/**
 * A school's page. People come here to do one of two things: report a problem
 * or see whether one is already listed. So the first screen is the school's
 * name, the report button, three numbers and the start of the list. Everything
 * else about the school folds away at the bottom.
 */
export function SchoolScreen() {
  const m = useMessages();
  const audience = useAudience();
  const { schoolId } = useParams<{ schoolId: string }>();
  const school = useQuery(`school:${schoolId}`, () => getApi().getSchool(schoolId));
  const issues = useQuery(`school-issues:${schoolId}`, () =>
    getApi().listIssues({ schoolId, sort: "most_affected" }),
  );

  if (school.error) {
    return (
      <Container>
        <LoadError onRetry={school.reload} />
      </Container>
    );
  }
  if (school.data === undefined) {
    return (
      <Container>
        <Loading />
      </Container>
    );
  }
  if (school.data === null) {
    return (
      <NotFound>
        <ButtonLink href="/schools">{m.schools.title}</ButtonLink>
      </NotFound>
    );
  }

  const s = school.data;
  const participating = s.participation === "participating";
  const reportHref = `/report?school=${s.id}`;
  const stats = [
    { label: m.school.statsOpen, value: s.stats.open, style: STATUS_STYLE.reported },
    {
      label: m.school.statsAwaiting,
      value: s.stats.awaitingReview,
      style: STATUS_STYLE.repair_claimed,
    },
    {
      label: m.school.statsVerified,
      value: s.stats.verified,
      style: STATUS_STYLE.independently_verified,
    },
  ];

  return (
    <>
      <SchoolContext id={s.id} name={s.name} />
      <PhotoHeader name="hero_school" priority>
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
          <Link
            href="/schools"
            className="no-print inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand-strong underline-offset-4 hover:underline"
          >
            <Icon name="arrowLeft" className="size-4" />
            {m.nav.schools}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{s.name}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-lg text-muted">
            <Icon name="mapPin" />
            {s.town}, {s.province}
          </p>
        </div>
      </PhotoHeader>

      <Container size="narrow" className="flex flex-col gap-6 pt-4 sm:pt-6">
        {audience.status === "ready" && audience.community ? (
          <ButtonLink href={reportHref} size="lg" className="w-full">
            <Icon name="plus" />
            {m.school.reportHere}
          </ButtonLink>
        ) : null}

        <div>
          <p className="sr-only" data-testid="school-story">
            {m.school.story(s.stats.open, s.stats.awaitingReview, s.stats.verified)}
          </p>
          <dl
            aria-label={m.school.statsLabel}
            className="grid grid-cols-3 gap-2 sm:gap-3"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className={cn(
                  "flex flex-col-reverse items-center rounded-2xl p-3 text-center",
                  stat.style.badge,
                )}
              >
                <dt className="text-sm leading-tight font-semibold">{stat.label}</dt>
                <dd className="font-display text-3xl font-semibold">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <section aria-labelledby="school-issues">
          <h2 id="school-issues" className="sr-only">
            {m.school.issuesTitle}
          </h2>
          {issues.error ? (
            <LoadError onRetry={issues.reload} />
          ) : !issues.data ? (
            <Loading lines={2} />
          ) : issues.data.length === 0 ? (
            <EmptyState title={m.school.issuesNone} photo="empty_state" />
          ) : (
            <div className="flex flex-col gap-6">
              {groupIssues(issues.data).map((group) => (
                <section
                  key={group.key}
                  aria-labelledby={`group-${group.key}`}
                  data-testid={`issue-group-${group.key}`}
                >
                  <h3
                    id={`group-${group.key}`}
                    className="flex items-center gap-2 text-xl font-semibold"
                  >
                    {m.school.groups[group.key]}
                    <span className="rounded-full bg-sunken px-2.5 py-0.5 text-sm text-muted">
                      {group.issues.length}
                    </span>
                  </h3>
                  <ul className="mt-2 flex flex-col gap-3">
                    {group.issues.map((issue) => (
                      <li key={issue.id}>
                        <IssueRow issue={issue} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>

        <details className="rounded-2xl border border-line bg-surface px-4 py-1">
          <summary className="flex min-h-12 cursor-pointer items-center font-semibold">
            {m.school.more}
          </summary>
          <div className="flex flex-col gap-4 pb-4">
            <ParticipationBadge school={s} />
            <p className="text-muted">
              {participating ? m.schools.participatingHelp : m.schools.invitedHelp}
              {s.participatingSince
                ? ` ${m.schools.since(formatDate(s.participatingSince))}.`
                : ""}
            </p>
            <p>{s.about}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted">{m.school.phase}</dt>
              <dd className="font-semibold">{s.phase}</dd>
              <dt className="text-muted">{m.school.learners}</dt>
              <dd className="font-semibold">{s.learners.toLocaleString("en-ZA")}</dd>
              <dt className="text-muted">{m.school.district}</dt>
              <dd className="font-semibold">{s.district}</dd>
            </dl>
            <div>
              <p className="font-semibold">{m.school.updatesTitle}</p>
              {s.latestUpdates.length === 0 ? (
                <p className="mt-1 text-muted">{m.school.updatesNone}</p>
              ) : (
                <ul className="mt-1 flex flex-col divide-y divide-line">
                  {s.latestUpdates.map((update) => (
                    <li key={update.event.id} className="py-2">
                      <p className="font-semibold">{m.event[update.event.type]}</p>
                      <Link
                        href={`/issues/${update.issueId}`}
                        className="underline underline-offset-4"
                      >
                        {update.issueTitle}
                      </Link>
                      <p className="text-sm text-muted">
                        {m.actor[update.event.actor]} ·{" "}
                        {timeAgo(update.event.occurredAt, m)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </details>
      </Container>
    </>
  );
}
