"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { BackButton, showInUrl } from "@/components/staff/flow";
import { EmptyState } from "@/components/ui/empty-state";
import { Container, LoadError, Loading, PageHeader } from "@/components/ui/page";
import { getApi } from "@/data/api";
import { WORKSPACE } from "@/data/audience";
import type { WorkQueueItem } from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import type { ProcurementRole } from "@/i18n/en-procurement";
import { RequireRole } from "../auth/require-role";
import { NextCard, QueueRows } from "./work-queue";

/** The last line of every signed-in procurement screen. */
export function TestnetNote() {
  const m = useMessages();
  return (
    <p data-testid="testnet-note" className="mt-8 text-sm text-muted">
      {m.procurement.testnet}
    </p>
  );
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
  /** The one task of this role for a case. `inCard` is true inside "Next for you". */
  task: (issueId: string, options: { inCard: boolean; open: () => void }) => ReactNode;
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
  task: (issueId: string, options: { inCard: boolean; open: () => void }) => ReactNode;
  inCard: boolean;
  order?: (items: WorkQueueItem[]) => WorkQueueItem[];
}) {
  const m = useMessages();
  const h = m.procurement.home;
  const openId = useSearchParams().get("case");
  const queue = useQuery(`work-queue:${role}`, () => getApi().listWorkQueue());
  const open = (issueId: string) => showInUrl({ case: issueId });

  if (openId) {
    return (
      <Container size="narrow">
        <div data-testid="case-task" data-case={openId}>
          <BackButton
            onClick={() => {
              showInUrl(null);
              queue.reload();
            }}
          >
            {h.backToList}
          </BackButton>
          {task(openId, { inCard: false, open: () => open(openId) })}
          <TestnetNote />
        </div>
      </Container>
    );
  }

  const items = queue.data ? (order ? order(queue.data) : queue.data) : undefined;
  const [first, ...rest] = items ?? [];
  return (
    <Container>
      <div className="mx-auto max-w-5xl" data-testid="role-home" data-role={role}>
        <PageHeader title={m.nav.workspace[role]} intro={h.intro[role]} />
        {queue.error ? (
          <LoadError onRetry={queue.reload} />
        ) : !items ? (
          <Loading lines={2} />
        ) : !first ? (
          <EmptyState title={h.empty[role]} icon={WORKSPACE[role].icon} />
        ) : (
          <div className="grid gap-6 md:grid-cols-3 md:items-start">
            <div className="md:col-span-2">
              <NextCard key={first.issueId} item={first} onOpen={open}>
                {inCard
                  ? task(first.issueId, {
                      inCard: true,
                      open: () => open(first.issueId),
                    })
                  : undefined}
              </NextCard>
            </div>
            <QueueRows items={rest} onOpen={open} />
          </div>
        )}
        <TestnetNote />
      </div>
    </Container>
  );
}
