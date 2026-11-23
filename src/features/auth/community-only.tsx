"use client";

import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Notice, PageLoading, PageShell } from "@/components/ui/page";
import { useAudience, workspaceFor } from "@/data/audience";
import { signOut } from "@/data/session";
import { useMessages } from "@/i18n";

/**
 * Shows a community page (report a problem, add evidence, my reports) to
 * people who are signed out or signed in as a community reporter. Staff get a
 * short explanation and the way to their own workspace. The backend refuses
 * these actions for staff regardless.
 */
export function CommunityOnly({ children }: { children: ReactNode }) {
  const m = useMessages();
  const audience = useAudience();

  if (audience.status === "loading") return <PageLoading lines={2} />;
  if (audience.community || audience.role === null) return children;

  const workspace = workspaceFor(audience.role);
  return (
    <PageShell
      eyebrow={m.shell.eyebrow.community}
      title={m.audience.communityTitle}
      width="narrow"
      size="compact"
    >
      <div data-testid="community-gate" className="flex flex-col gap-4">
        <Notice tone="info" icon="info">
          {m.audience.communityBody(m.auth.aRole[audience.role])}
        </Notice>
        <p className="text-muted">{m.audience.signOutToReport}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          {workspace && audience.role !== "reporter" ? (
            <ButtonLink href={workspace.href}>
              <Icon name={workspace.icon} />
              {m.audience.goTo(m.nav.workspace[audience.role])}
            </ButtonLink>
          ) : null}
          <Button variant="secondary" onClick={() => void signOut()}>
            {m.auth.signOut}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
