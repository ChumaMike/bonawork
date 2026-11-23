"use client";

import { cn } from "@/components/ui/cn";
import { Icon } from "@/components/ui/icon";
import type { Issue } from "@/data/types";

/** One line of a short staff list: a title, one line under it, and whether it is late. */
export interface StaffRow {
  issue: Issue;
  line: string;
  late: boolean;
}

/**
 * One group of a short staff list ("Reply needed · 2"): a heading with the
 * count, then one line per report. A row has no action buttons. The whole
 * row is one button that opens the report, where the answers are.
 */
export function QueueGroup({
  id,
  title,
  rows,
  empty,
  onOpen,
  itemTestId = "queue-item",
  className,
}: {
  /** Used for the heading id and `data-group`. */
  id: string;
  title: string;
  rows: StaffRow[];
  /** One sentence shown when the group has no reports. */
  empty: string;
  onOpen: (issueId: string) => void;
  itemTestId?: string;
  className?: string;
}) {
  const headingId = `group-${id}`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid="queue-group"
      data-group={id}
      className={className}
    >
      <h2 id={headingId} className="text-xl">
        {title} <span className="text-muted">· {rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-sunken px-5 py-4 text-muted">{empty}</p>
      ) : (
        /* Tailwind resets list-style, and Safari then drops the list role; say it explicitly. */
        /* eslint-disable-next-line jsx-a11y/no-redundant-roles */
        <ul
          role="list"
          className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card"
        >
          {rows.map(({ issue, line, late }, index) => (
            <li key={issue.id} data-testid={itemTestId} data-status={issue.status}>
              <button
                type="button"
                onClick={() => onOpen(issue.id)}
                className={cn(
                  "flex min-h-16 w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-sunken",
                  index === 0 && "rounded-t-2xl",
                  index === rows.length - 1 && "rounded-b-2xl",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block leading-snug font-medium">{issue.title}</span>
                  <span
                    data-late={late || undefined}
                    className={cn(
                      "mt-0.5 flex items-center gap-1.5 text-sm",
                      late ? "font-medium text-danger" : "text-muted",
                    )}
                  >
                    {late ? <Icon name="clock" className="size-4" /> : null}
                    <span className="truncate">{line}</span>
                  </span>
                </span>
                <Icon name="chevronDown" className="size-5 -rotate-90 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
