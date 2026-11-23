"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { BackButton, showInUrl } from "@/components/staff/flow";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { LoadError, Loading, PageShell } from "@/components/ui/page";
import { getApi } from "@/data/api";
import { WORKSPACE } from "@/data/audience";
import type { WorkQueueItem } from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import type { ProcurementRole, TrailRowKey } from "@/i18n/en-procurement";
import { RequireRole } from "../auth/require-role";
import { TRAIL_ROW_ORDER } from "./trail-rows";
import { NextCard, QueueRows } from "./work-queue";

/** The last line of every signed-in procurement screen. */
export function TestnetNote() {
  const m = useMessages();
  return (
    <p data-testid="testnet-note" className="mt-10 text-sm text-muted">
      {m.procurement.testnet}
    </p>
  );
}

/** The rows of the trail each role acts on. */
const ROLE_ROWS: Record<ProcurementRole, readonly TrailRowKey[]> = {
  buyer: ["order"],
  supplier: ["acknowledged", "invoice"],
  receiving_officer: ["delivery"],
  payment_approver: ["release"],
};

/**
 * Where this role's step sits among the eight rows of a case's trail: the
 * report, then the seven steps, with this role's own marked. It says in one
 * glance who acts before and after, and that nobody takes two roles' steps.
 */
function TrailPlace({ role }: { role: ProcurementRole }) {
  const m = useMessages();
  const p = m.procurement.home.place;
  return (
    <section
      aria-labelledby="trail-place-title"
      data-testid="trail-place"
      className="rounded-2xl border border-line bg-surface p-5 shadow-card"
    >
      <h2 id="trail-place-title" className="text-xl">
        {p.title}
      </h2>
      <ol className="mt-3 flex flex-col">
        {TRAIL_ROW_ORDER.map((key, index) => {
          const mine = ROLE_ROWS[role].includes(key);
          return (
            <li
              key={key}
              aria-current={mine ? "step" : undefined}
              className="flex items-center gap-3 py-1.5 text-[0.95rem]"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  mine ? "bg-brand text-on-brand" : "bg-sunken text-muted",
                )}
              >
                {index === 0 ? <Icon name="flag" className="size-3.5" /> : index}
              </span>
              <span className={cn("min-w-0 flex-1", mine ? "font-medium" : "text-muted")}>
                {m.procurement.trail.title[key]}
              </span>
              {mine ? (
                <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium whitespace-nowrap text-brand-strong">
                  {p.yours}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-sm text-muted">{p.rule}</p>
    </section>
  );
}

/** What a role's home hands to its task: where it is shown, and the way around it. */
export interface TaskOptions {
  /** True inside the "Next for you" card, which already names the case. */
  inCard: boolean;
  /** Open this case on its own screen. */
  open: () => void;
  /** The way back to the list, for the band of a case's own screen. */
  back?: ReactNode;
}

/**
 * The home of one procurement role. Every role gets the same page, so a
 * person who has seen one can use any of them: the case that has waited
 * longest as "Next for you", the others as compact rows, and nothing else.
 * Opening a case (`?case=<id>`) shows that one task on its own.
 */
export function RoleHome({
  forRole: role,
  task,
  inCard = false,
  order,
}: {
  forRole: ProcurementRole;
  /** The one task of this role for a case. */
  task: (issueId: string, options: TaskOptions) => ReactNode;
  /** Do the work inside the "Next for you" card instead of behind a button. */
  inCard?: boolean;
  /** Reorder the queue, which arrives longest wait first. */
  order?: (items: WorkQueueItem[]) => WorkQueueItem[];
}) {
  return (
    <RequireRole allow={role} next={WORKSPACE[role].href}>
      {() => <Home forRole={role} task={task} inCard={inCard} order={order} />}
    </RequireRole>
  );
}

function Home({
  forRole: role,
  task,
  inCard,
  order,
}: {
  forRole: ProcurementRole;
  task: (issueId: string, options: TaskOptions) => ReactNode;
  inCard: boolean;
  order?: (items: WorkQueueItem[]) => WorkQueueItem[];
}) {
  const m = useMessages();
  const h = m.procurement.home;
  const openId = useSearchParams().get("case");
  const queue = useQuery(`work-queue:${role}`, () => getApi().listWorkQueue());
  const open = (issueId: string) => showInUrl({ case: issueId });

  if (openId) {
    // The task draws the band itself: its title is the case, which it loads.
    return (
      <div data-testid="case-task" data-case={openId}>
        {task(openId, {
          inCard: false,
          open: () => open(openId),
          back: (
            <BackButton
              onClick={() => {
                showInUrl(null);
                queue.reload();
              }}
            >
              {h.backToList}
            </BackButton>
          ),
        })}
      </div>
    );
  }

  const items = queue.data ? (order ? order(queue.data) : queue.data) : undefined;
  const [first, ...rest] = items ?? [];
  return (
    <div data-testid="role-home" data-role={role}>
      <PageShell eyebrow={m.auth.role[role]} title={h.title[role]} intro={h.intro[role]}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="min-w-0">
            {queue.error ? (
              <LoadError onRetry={queue.reload} />
            ) : !items ? (
              <Loading lines={2} />
            ) : !first ? (
              <EmptyState title={h.empty[role]} icon={WORKSPACE[role].icon} />
            ) : (
              <NextCard key={first.issueId} item={first} onOpen={open}>
                {inCard
                  ? task(first.issueId, {
                      inCard: true,
                      open: () => open(first.issueId),
                    })
                  : undefined}
              </NextCard>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <QueueRows items={rest} onOpen={open} />
            <TrailPlace role={role} />
          </div>
        </div>
        <TestnetNote />
      </PageShell>
    </div>
  );
}
