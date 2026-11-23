"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { SchoolContext } from "@/components/chrome";
import { IssueRow } from "@/components/issue-card";
import { schoolPhoto } from "@/components/media/manifest";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import {
  Container,
  LoadError,
  Loading,
  NotFound,
  HeroFigure,
  PageError,
  PageHero,
  PageLoading,
} from "@/components/ui/page";
import { STATUS_TONE } from "@/components/ui/status-pill";
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
 * or see whether one is already listed. So the band holds the school's name
 * and the report button, then three numbers and the list. What else there is
 * to know about the school sits beside the list, or under it on a phone.
 */
export function SchoolScreen() {
  const m = useMessages();
  const audience = useAudience();
  const { schoolId } = useParams<{ schoolId: string }>();
  const school = useQuery(`school:${schoolId}`, () => getApi().getSchool(schoolId));
  const issues = useQuery(`school-issues:${schoolId}`, () =>
    getApi().listIssues({ schoolId, sort: "most_affected" }),
  );

  if (school.error) return <PageError onRetry={school.reload} />;
  if (school.data === undefined) return <PageLoading />;
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
    { label: m.school.statsOpen, value: s.stats.open, tone: STATUS_TONE.reported },
    {
      label: m.school.statsAwaiting,
      value: s.stats.awaitingReview,
      tone: STATUS_TONE.repair_claimed,
    },
    {
      label: m.school.statsVerified,
      value: s.stats.verified,
      tone: STATUS_TONE.independently_verified,
    },
  ];

  return (
    <>
      <SchoolContext id={s.id} name={s.name} />
      <PageHero
        figure={<HeroFigure name={schoolPhoto(s.id)} testId="school-photo" />}
        back={{ href: "/schools", label: m.nav.schools }}
        eyebrow={m.shell.eyebrow.school}
        title={s.name}
        meta={
          <>
            <span>
              <Icon name="mapPin" className="size-4" />
              {s.town}, {s.province}
            </span>
            <span>
              <Icon name="users" className="size-4" />
              {m.schools.learners(s.learners)}
            </span>
          </>
        }
      >
        {audience.status === "ready" && audience.community ? (
          <div className="vl-pagehero-actions">
            <Link href={reportHref} className="vl-btn vl-btn-white">
              <Icon name="plus" className="size-5" />
              {m.school.reportHere}
            </Link>
          </div>
        ) : null}
      </PageHero>

      <Container className="flex flex-col gap-8">
        <div>
          <p className="sr-only" data-testid="school-story">
            {m.school.story(s.stats.open, s.stats.awaitingReview, s.stats.verified)}
          </p>
          <dl
            aria-label={m.school.statsLabel}
            className="grid grid-cols-3 gap-2 sm:gap-4"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="flex flex-col-reverse gap-1 rounded-2xl border border-line bg-surface p-3 shadow-card sm:p-5"
              >
                <dt className="flex items-center gap-1.5 text-sm leading-tight text-muted">
                  <span
                    aria-hidden="true"
                    className={cn("size-2 shrink-0 rounded-full", stat.tone.dot)}
                  />
                  {stat.label}
                </dt>
                <dd
                  className={cn(
                    "font-display text-3xl leading-none font-medium tracking-tight sm:text-5xl",
                    stat.tone.text,
                  )}
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <section aria-labelledby="school-issues" className="min-w-0">
            <h2 id="school-issues" className="sr-only">
              {m.school.issuesTitle}
            </h2>
            {issues.error ? (
              <LoadError onRetry={issues.reload} />
            ) : !issues.data ? (
              <Loading lines={2} />
            ) : issues.data.length === 0 ? (
              <EmptyState title={m.school.issuesNone} icon="list" />
            ) : (
              <div className="flex flex-col gap-8">
                {groupIssues(issues.data).map((group) => (
                  <section
                    key={group.key}
                    aria-labelledby={`group-${group.key}`}
                    data-testid={`issue-group-${group.key}`}
                  >
                    <h3
                      id={`group-${group.key}`}
                      className="flex items-center gap-2 text-xl"
                    >
                      {m.school.groups[group.key]}
                      <span className="rounded-full bg-sunken px-2.5 py-0.5 text-sm tracking-normal text-muted">
                        {group.issues.length}
                      </span>
                    </h3>
                    <ul className="mt-3 grid gap-3 sm:grid-cols-2">
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

          <details
            open
            className="rounded-2xl border border-line bg-surface px-5 py-1 shadow-card"
          >
            <summary className="flex min-h-12 cursor-pointer items-center font-medium">
              {m.school.more}
            </summary>
            <div className="flex flex-col gap-4 pb-5">
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
        </div>
      </Container>
    </>
  );
}
