"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { SchoolContext } from "@/components/chrome";
import { CATEGORY_PICTURE } from "@/components/community/picture";
import { EndorseButton } from "@/components/endorse-button";
import { EvidenceList } from "@/components/evidence-list";
import { LedgerChip } from "@/components/ledger-state";
import { ProofButton } from "@/components/proof/proof-button";
import { Timeline } from "@/components/timeline";
import { ButtonLink } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import {
  Container,
  HeroFigure,
  NotFound,
  Notice,
  PageError,
  PageHero,
  PageLoading,
} from "@/components/ui/page";
import { StatusPill } from "@/components/ui/status-pill";
import { TabPanel, Tabs } from "@/components/ui/tabs";
import { getApi } from "@/data/api";
import { canReadProcurement, useAudience, workspaceFor } from "@/data/audience";
import type { IndependentReview } from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages, type Messages } from "@/i18n";
import { timeAgo } from "@/lib/format";
import { PublicTrail, StaffTrail } from "../procurement/money-trail";
import { FundRepair } from "./fund-repair";

type TabId = "summary" | "timeline" | "trail" | "proof";
const TABS = "issue";

function ReviewNotice({ review, m }: { review: IndependentReview; m: Messages }) {
  const view = {
    awaiting: { tone: "warning", icon: "clock", text: m.issue.reviewAwaiting },
    verified: { tone: "success", icon: "shieldCheck", text: m.issue.reviewVerified },
    disputed: { tone: "danger", icon: "alert", text: m.issue.reviewDisputed },
  } as const;
  const { tone, icon, text } = view[review.state];
  return (
    <Notice tone={tone} icon={icon} title={m.issue.reviewTitle}>
      <p data-testid="review-state" data-review={review.state}>
        {text}
      </p>
      {review.note ? (
        <p className="mt-2">
          <span className="font-semibold">{m.issue.reviewerNote}:</span> {review.note}
        </p>
      ) : null}
    </Notice>
  );
}

/**
 * One problem. The question people bring is "has it been fixed, and who says
 * so?", so the band holds the title and where it stands. The history and the
 * proof are one tap away on their own tabs. What a visitor can do about it
 * ("I'm affected too", and funding a repair that has no work order yet) sits
 * beside the tabs on a wide screen and under the summary on a phone.
 */
export function IssueScreen() {
  const m = useMessages();
  const { issueId } = useParams<{ issueId: string }>();
  const query = useQuery(`issue:${issueId}`, () => getApi().getIssue(issueId));
  const [tab, setTab] = useState<TabId>("summary");
  const audience = useAudience();
  const staffRole = audience.community ? null : audience.role;
  const workspace = workspaceFor(staffRole);
  // The staff version of the trail, for the roles that may read it. Everyone
  // else never asks for it: they get the public trail that came with the issue.
  const reader = audience.status === "ready" && canReadProcurement(audience.role);
  const moneyTrail = useQuery(
    `issue-trail:${issueId}:${reader ? audience.role : "public"}`,
    () => (reader ? getApi().getMoneyTrail(issueId) : Promise.resolve(null)),
  );

  if (query.error) return <PageError onRetry={query.reload} />;
  if (query.data === undefined) return <PageLoading />;
  if (query.data === null) {
    return (
      <NotFound>
        <ButtonLink href="/issues">{m.feed.title}</ButtonLink>
      </NotFound>
    );
  }

  const issue = query.data;
  const report = issue.timeline.find((event) => event.type === "reported");
  const declined =
    issue.status === "declined"
      ? [...issue.timeline].reverse().find((event) => event.type === "declined")
      : undefined;

  /** Jump from an "evidence added" line in the timeline to that item on the Proof tab. */
  function seeEvidence(evidenceId?: string) {
    setTab("proof");
    requestAnimationFrame(() => {
      const target = document.getElementById(
        evidenceId ? `evidence-${evidenceId}` : `${TABS}-panel-proof`,
      );
      target?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <>
      <SchoolContext id={issue.schoolId} name={issue.schoolName} />
      <PageHero
        figure={
          <HeroFigure
            name={CATEGORY_PICTURE[issue.category]}
            caption={m.issue.pictureNote}
            testId="issue-picture"
          />
        }
        back={{
          href: `/schools/${issue.schoolId}`,
          label: issue.schoolName,
          ariaLabel: m.issue.backToSchool(issue.schoolName),
        }}
        eyebrow={m.category[issue.category]}
        title={issue.title}
        meta={
          <>
            <StatusPill status={issue.status} size="lg" unverifiedHint={false} />
            {issue.status === "repair_claimed" ? (
              <span className="font-medium">{m.status.notVerifiedYet}</span>
            ) : null}
            <span>
              <Icon name="mapPin" className="size-4 shrink-0" />
              {issue.location}
            </span>
          </>
        }
      />

      <Container className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="min-w-0">
          <Tabs
            label={m.issue.tabsLabel}
            idPrefix={TABS}
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "summary", label: m.issue.tabs.summary },
              { id: "timeline", label: m.issue.tabs.timeline },
              // A declined report goes no further, so it has no trail to follow.
              ...(issue.status === "declined"
                ? []
                : [{ id: "trail" as const, label: m.procurement.trail.tab }]),
              { id: "proof", label: m.issue.tabs.proof, count: issue.evidence.length },
            ]}
          />

          <TabPanel id="summary" idPrefix={TABS} active={tab === "summary"}>
            <div className="flex flex-col gap-5">
              {/* The review notice says the same thing with more detail, so only one is shown. */}
              {issue.review ? (
                <ReviewNotice review={issue.review} m={m} />
              ) : (
                <p
                  className="text-xl font-medium tracking-tight"
                  data-testid="status-meaning"
                >
                  {m.status.meaning[issue.status]}
                </p>
              )}
              {declined ? (
                <Notice icon="ban" title={m.issue.declinedTitle}>
                  <p className="text-muted">{m.issue.declinedKind}</p>
                  <p data-testid="decline-reason" className="mt-2 font-semibold">
                    {declined.note}
                  </p>
                </Notice>
              ) : null}

              <Card aria-labelledby="whats-wrong" role="group">
                <h2
                  id="whats-wrong"
                  className="font-sans text-sm font-medium tracking-normal text-muted"
                >
                  {m.issue.whatsWrong}
                </h2>
                <p className="mt-1.5 text-lg">{issue.description}</p>
                <p className="mt-2 text-sm text-muted">
                  {m.category[issue.category]} ·{" "}
                  {m.common.reported(timeAgo(issue.createdAt, m))}
                </p>
              </Card>

              {issue.interimProtection ? (
                <Notice tone="success" icon="shield" title={m.issue.interimTitle}>
                  <p>{issue.interimProtection.description}</p>
                  <p className="mt-1 text-sm text-muted">
                    {m.common.updated(timeAgo(issue.interimProtection.recordedAt, m))}
                  </p>
                </Notice>
              ) : issue.status !== "independently_verified" &&
                issue.status !== "declined" ? (
                <Notice tone="warning" icon="alert" title={m.issue.interimTitle}>
                  <p data-testid="no-interim">{m.issue.interimNone}</p>
                </Notice>
              ) : null}
            </div>
          </TabPanel>

          <TabPanel id="timeline" idPrefix={TABS} active={tab === "timeline"}>
            <h2 id="timeline-title" className="sr-only">
              {m.issue.timelineTitle}
            </h2>
            <Timeline
              issueId={issue.id}
              events={issue.timeline}
              evidence={issue.evidence}
              onSeeEvidence={seeEvidence}
            />
          </TabPanel>

          <TabPanel id="trail" idPrefix={TABS} active={tab === "trail"}>
            {moneyTrail.data ? (
              <StaffTrail
                trail={moneyTrail.data}
                timeline={issue.timeline}
                status={issue.status}
              />
            ) : (
              <PublicTrail
                issueId={issue.id}
                steps={issue.publicTrail ?? []}
                timeline={issue.timeline}
                status={issue.status}
              />
            )}
          </TabPanel>

          <TabPanel id="proof" idPrefix={TABS} active={tab === "proof"}>
            <div className="flex flex-col gap-5">
              <h2 id="evidence-title" className="sr-only">
                {m.issue.evidenceTitle}
              </h2>
              <p className="text-muted">{m.issue.evidenceIntro}</p>
              {audience.status === "ready" && audience.community ? (
                <ButtonLink
                  href={`/issues/${issue.id}/evidence`}
                  variant="secondary"
                  className="w-full"
                >
                  <Icon name="upload" />
                  {m.issue.addEvidence}
                </ButtonLink>
              ) : null}
              {issue.evidence.length === 0 ? (
                <p className="text-muted">{m.issue.evidenceNone}</p>
              ) : (
                <EvidenceList issueId={issue.id} items={issue.evidence} />
              )}

              {report ? (
                <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
                  <p className="font-medium">{m.issue.blockchainTitle}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
                    <LedgerChip record={report.ledger} />
                    <ProofButton
                      issueId={issue.id}
                      recordId={report.id}
                      label={m.event[report.type]}
                      ledger={report.ledger}
                      withDocument
                      reportId={issue.id}
                    />
                  </div>
                </div>
              ) : null}

              <ButtonLink href="/verify" variant="quiet" className="justify-start px-0">
                {m.nav.verify}
                <Icon name="arrowRight" className="size-4" />
              </ButtonLink>
            </div>
          </TabPanel>
        </div>

        {/* On a phone these follow the summary only; the other tabs are for reading. */}
        <aside
          aria-label={m.issue.detailsTitle}
          className={cn(
            "flex flex-col gap-4 lg:sticky lg:top-24",
            tab !== "summary" && "max-lg:hidden",
          )}
        >
          <Card className="flex flex-col gap-3">
            <h2 className="text-xl">{m.issue.affectedTitle}</h2>
            <EndorseButton
              key={`${issue.id}:${issue.endorsedByMe}`}
              issueId={issue.id}
              endorsements={issue.endorsements}
              endorsedByMe={issue.endorsedByMe}
              size="large"
            />
            {staffRole && staffRole !== "reporter" ? (
              <div data-testid="staff-note" className="flex flex-col gap-2">
                <p className="text-sm text-muted">
                  {m.audience.issueNote(m.auth.aRole[staffRole])}
                </p>
                {workspace ? (
                  <ButtonLink
                    href={workspace.href}
                    variant="secondary"
                    size="sm"
                    className="self-start"
                  >
                    <Icon name={workspace.icon} className="size-4" />
                    {m.audience.goTo(m.nav.workspace[staffRole])}
                  </ButtonLink>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted">{m.endorse.help}</p>
            )}
          </Card>

          <FundRepair issue={issue} audience={audience} />

          <dl className="divide-y divide-line rounded-2xl border border-line bg-surface px-5 shadow-card">
            <div className="py-4">
              <dt className="text-sm text-muted">{m.issue.authorityTitle}</dt>
              <dd className="font-medium">{issue.authority.name}</dd>
              <dd className="text-sm text-muted">{issue.authority.responsibility}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-3 py-4">
              <div>
                <dt className="text-sm text-muted">{m.issue.reference}</dt>
                <dd className="font-mono text-lg font-medium">{issue.reference}</dd>
              </div>
              <CopyButton value={issue.reference} label={m.issue.reference} />
            </div>
          </dl>
        </aside>
      </Container>
    </>
  );
}
