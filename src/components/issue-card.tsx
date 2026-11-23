"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { IssueSummary } from "@/data/types";
import { useMessages } from "@/i18n";
import { timeAgo } from "@/lib/format";
import { CATEGORY_PICTURE, CategoryGlyph } from "./community/picture";
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
        // The category's name is in the card, so the picture adds nothing for a screen reader.
        <Photo
          name={CATEGORY_PICTURE[issue.category]}
          alt=""
          shape="free"
          sizes="(min-width: 1024px) 360px, (min-width: 768px) 50vw, 100vw"
          className="aspect-[16/9] w-full"
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
 * One public issue as a picture card: the picture for that type of problem
 * on top, then the problem in words and where it stands. The whole card is
 * the link. Used where the list is the page (a school's problems).
 */
export function IssueRow({ issue }: { issue: IssueSummary }) {
  const m = useMessages();
  return (
    <Link
      href={`/issues/${issue.id}`}
      data-testid="issue-card"
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-raised"
    >
      <Photo
        name={CATEGORY_PICTURE[issue.category]}
        alt=""
        shape="free"
        sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
        className="aspect-[16/9] w-full"
      />
      <span className="flex flex-1 flex-col gap-1.5 p-4">
        <span className="inline-flex items-center gap-1 text-sm text-muted">
          <CategoryGlyph category={issue.category} className="size-4" />
          {m.category[issue.category]}
        </span>
        <span className="text-lg leading-snug font-medium tracking-tight group-hover:underline group-hover:underline-offset-4">
          {issue.title}
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <StatusBadge status={issue.status} />
          <span>{m.endorse.count(issue.endorsements)}</span>
        </span>
      </span>
    </Link>
  );
}
