"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { IssueSummary } from "@/data/types";
import { useMessages } from "@/i18n";
import { timeAgo } from "@/lib/format";
import { CATEGORY_PICTURE, CategoryGlyph, Picture } from "./community/picture";
import { Photo } from "./media/photo";
import { EndorseButton } from "./endorse-button";
import { StatusBadge } from "./status";
import { Icon } from "./ui/icon";

/**
 * One public issue. The title is the link; the whole card is not, so the
 * "I'm affected too" button stays a separate, unambiguous target.
 */
export function IssueCard({
  issue,
  showSchool = true,
  endorse = true,
  picture = false,
  heading: Heading = "h3",
  footer,
}: {
  issue: IssueSummary;
  showSchool?: boolean;
  endorse?: boolean;
  /** Lead with the picture for this type of problem. */
  picture?: boolean;
  /** Heading level of the title: "h2" when the cards sit directly under the page's h1. */
  heading?: "h2" | "h3";
  /** Replaces the endorse row, e.g. with dashboard actions. */
  footer?: ReactNode;
}) {
  const m = useMessages();
  return (
    <article
      data-testid="issue-card"
      className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-raised"
    >
      {picture ? (
        <Picture
          name={CATEGORY_PICTURE[issue.category]}
          decorative
          blend
          className="aspect-[3/1]"
        />
      ) : null}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={issue.status} />
          {issue.hasInterimProtection ? (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-muted">
              <Icon name="shield" className="size-4" />
              {m.feed.interim}
            </span>
          ) : null}
        </div>

        <Heading className="text-lg leading-snug font-medium tracking-tight">
          <Link
            href={`/issues/${issue.id}`}
            className="underline-offset-4 hover:underline"
          >
            {issue.title}
          </Link>
        </Heading>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            <CategoryGlyph category={issue.category} className="size-4" />
            {m.category[issue.category]}
          </span>
          {showSchool ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="school" className="size-4" />
              {issue.schoolName}, {issue.schoolTown}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Icon name="mapPin" className="size-4" />
              {issue.location}
            </span>
          )}
          <span>{m.common.updated(timeAgo(issue.updatedAt, m))}</span>
        </p>

        <div className="mt-auto border-t border-line pt-3">
          {footer ??
            (endorse ? (
              <EndorseButton
                issueId={issue.id}
                endorsements={issue.endorsements}
                endorsedByMe={issue.endorsedByMe}
              />
            ) : (
              <span className="flex items-center gap-1.5 font-medium">
                <Icon name="users" className="size-5 text-muted" />
                {m.endorse.count(issue.endorsements)}
              </span>
            ))}
        </div>
      </div>
    </article>
  );
}

/**
 * One public issue as a picture tile: the problem in words on the left, the
 * picture for that type of problem fading in from the right, and where it
 * stands. The whole tile is the link. Used where the list is the page (a
 * school's problems), so nothing competes with reading down it.
 */
export function IssueRow({ issue }: { issue: IssueSummary }) {
  const m = useMessages();
  return (
    <Link
      href={`/issues/${issue.id}`}
      data-testid="issue-card"
      className="relative flex min-h-28 items-center overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-raised"
    >
      <Photo
        name={CATEGORY_PICTURE[issue.category]}
        alt=""
        shape="free"
        sizes="220px"
        className="photo-blend-side absolute! inset-y-0 right-0 h-full w-[42%]"
      />
      <span className="relative flex max-w-[68%] flex-col gap-1.5 p-4">
        <span className="text-lg leading-snug font-medium tracking-tight">
          {issue.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <StatusBadge status={issue.status} />
          <span>{m.endorse.count(issue.endorsements)}</span>
        </span>
      </span>
    </Link>
  );
}
