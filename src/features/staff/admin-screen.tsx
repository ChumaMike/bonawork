"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { BuddyHint } from "@/components/buddy/buddy-hint";
import { showInUrl } from "@/components/staff/flow";
import { QueueGroup } from "@/components/staff/queue-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Container, LoadError, Loading, PageHeader } from "@/components/ui/page";
import { getApi } from "@/data/api";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import { formatDate } from "@/lib/format";
import { RequireRole } from "../auth/require-role";
import { GuidedReport } from "./guided-report";
import { groupQueue, nextToReply } from "./queue";

/** The three groups a school works through, most urgent first. Closed reports sit behind a button. */
const OPEN_GROUPS = ["reply", "fixing", "review"] as const;

export function AdminScreen() {
  return (
    <RequireRole allow="school_admin" next="/admin">
      {(session) => <AdminDashboard schoolId={session.user.institutionId ?? ""} />}
    </RequireRole>
  );
}

/**
 * The school's reports as a short list by urgency: one line per report, the
 * late ones marked, no buttons in the list. Opening a report (`?report=<id>`)
 * shows it on its own with the answers that fit its status.
 */
function AdminDashboard({ schoolId }: { schoolId: string }) {
  const m = useMessages();
  const a = m.admin;
  const openId = useSearchParams().get("report");
  const school = useQuery(`admin-school:${schoolId}`, () => getApi().getSchool(schoolId));
  const queue = useQuery(`queue:${schoolId}`, () => getApi().listSchoolQueue(schoolId));
  const [showClosed, setShowClosed] = useState(false);

  const issues = queue.data;
  const groups = groupQueue(issues ?? [], m);
  const open = openId ? (issues?.find((issue) => issue.id === openId) ?? null) : null;
  const schoolName = school.data?.name ?? "";

  if (issues && open) {
    return (
      <GuidedReport
        key={open.id}
        issue={open}
        next={nextToReply(groups.reply, open.id)}
        onBack={() => showInUrl(null)}
        onOpen={(id) => showInUrl({ report: id })}
        onChanged={(updated) =>
          queue.setData(
            issues.map((issue) => (issue.id === updated.id ? updated : issue)),
          )
        }
      />
    );
  }

  return (
    <Container>
      <BuddyHint id="admin" />
      <PageHeader title={a.title}>
        {issues ? (
          <p data-testid="queue-headline" className="mt-2 text-xl font-semibold">
            {a.headline(groups.reply.length)}
          </p>
        ) : null}
        <p className="mt-1 text-sm text-muted">
          {schoolName ? `${schoolName}. ` : ""}
          {a.onlyThisSchool}
        </p>
        <p className="hidden text-sm text-muted print:block">
          {a.printedFor(schoolName, formatDate(new Date().toISOString()))}
        </p>
      </PageHeader>

      {queue.error ? (
        <LoadError onRetry={queue.reload} />
      ) : !issues ? (
        <Loading />
      ) : issues.length === 0 ? (
        <EmptyState title={a.empty} photo="admin_desk" />
      ) : (
        <>
          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start">
            {OPEN_GROUPS.map((id) => (
              <QueueGroup
                key={id}
                id={id}
                title={a.groups[id]}
                rows={groups[id]}
                empty={a.groupEmpty[id]}
                onOpen={(issueId) => showInUrl({ report: issueId })}
              />
            ))}
          </div>

          {groups.closed.length > 0 ? (
            <div className="mt-8 flex flex-col items-start gap-3">
              <Button
                variant="quiet"
                aria-expanded={showClosed}
                aria-controls="closed-reports"
                onClick={() => setShowClosed(!showClosed)}
                className="no-print -ml-3"
              >
                {showClosed ? a.hideClosed : a.showClosed(groups.closed.length)}
                <Icon
                  name={showClosed ? "chevronUp" : "chevronDown"}
                  className="size-4"
                />
              </Button>
              <div
                id="closed-reports"
                hidden={!showClosed}
                className="w-full lg:max-w-md"
              >
                <QueueGroup
                  id="closed"
                  title={a.groups.closed}
                  rows={groups.closed}
                  empty={a.groupEmpty.closed}
                  onOpen={(issueId) => showInUrl({ report: issueId })}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
    </Container>
  );
}
