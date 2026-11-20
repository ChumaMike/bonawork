"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import type { WorkQueueItem } from "@/data/types";
import { useMessages } from "@/i18n";
import { timeAgo } from "@/lib/format";
import { StagePill } from "./stage-pill";

/** The reference and the school of a case, on one line. */
export function CaseLine({
  item,
}: {
  item: Pick<WorkQueueItem, "reference" | "schoolName">;
}) {
  return (
    <p className="flex flex-col text-sm text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
      <span className="font-mono">{item.reference}</span>
      {/* On a phone the two sit on their own lines, so the dot would dangle. */}
      <span aria-hidden="true" className="hidden sm:inline">
        ·
      </span>
      <span>{item.schoolName}</span>
    </p>
  );
}

/**
 * "Next for you": the case that has waited longest, as one card with one
 * button. `children` replaces the button when the work itself fits in the
 * card, as the release gate does.
 */
export function NextCard({
  item,
  onOpen,
  children,
}: {
  item: WorkQueueItem;
  onOpen: (issueId: string) => void;
  children?: ReactNode;
}) {
  const m = useMessages();
  const h = m.procurement.home;
  return (
    <Card
      data-testid="next-card"
      data-action={item.action}
      // Once the release is authorised inside this card, the gate says so itself:
      // the queue's older "waiting" line would contradict it, so it steps aside.
      className="flex flex-col gap-3 [&:has([data-gate=authorised])_[data-waiting-line]]:hidden"
    >
      <p className="text-sm font-semibold tracking-wide text-muted uppercase">
        {h.nextForYou}
      </p>
      <div>
        <CaseLine item={item} />
        <h2 className="mt-1 text-2xl">{item.title}</h2>
      </div>
      <p
        data-waiting-line=""
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted"
      >
        <StagePill stage={item.stage} />
        <span>{h.waitingSince(timeAgo(item.since, m))}</span>
      </p>
      {children ?? (
        <Button
          size="lg"
          onClick={() => onOpen(item.issueId)}
          className="w-full sm:w-auto sm:self-start"
        >
          {h.open[item.action]}
          <Icon name="arrowRight" />
        </Button>
      )}
    </Card>
  );
}

/** "Also waiting": the other cases as compact rows. A row is one button that opens the case. */
export function QueueRows({
  items,
  onOpen,
}: {
  items: WorkQueueItem[];
  onOpen: (issueId: string) => void;
}) {
  const m = useMessages();
  const h = m.procurement.home;
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="also-waiting" data-testid="also-waiting">
      <h2 id="also-waiting" className="text-xl">
        {h.alsoWaiting(items.length)}
      </h2>
      {/* Tailwind resets list-style, and Safari then drops the list role; say it explicitly. */}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul
        role="list"
        className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card"
      >
        {items.map((item, index) => (
          <li key={`${item.issueId}:${item.action}`} data-testid="queue-row">
            <button
              type="button"
              onClick={() => onOpen(item.issueId)}
              className={cn(
                "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-sunken",
                index === 0 && "rounded-t-2xl",
                index === items.length - 1 && "rounded-b-2xl",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block leading-snug font-semibold">{item.title}</span>
                <span className="mt-0.5 block truncate text-sm text-muted">
                  {item.action === "authorise_release"
                    ? item.blockers.length > 0
                      ? h.locked(item.blockers.length)
                      : h.readyToAuthorise
                    : h.asks[item.action]}{" "}
                  · <span className="font-mono">{item.reference}</span>
                </span>
              </span>
              <Icon name="chevronRight" className="size-5 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
