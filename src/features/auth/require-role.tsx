"use client";

import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Notice, PageLoading, PageShell } from "@/components/ui/page";
import { signOut, useSession } from "@/data/session";
import type { Session, SessionRole } from "@/data/types";
import { useMessages } from "@/i18n";

/**
 * Shows a staff page only to a signed-in user with the right role. Everyone
 * else gets a plain explanation and the way to sign in. This is a courtesy:
 * the backend refuses the data and the actions regardless of what the UI shows.
 */
export function RequireRole({
  allow,
  next,
  children,
}: {
  /** The one role this page is for. */
  allow: SessionRole;
  /** Where to return after signing in. */
  next: string;
  children: (session: Session) => ReactNode;
}) {
  const m = useMessages();
  const { status, session } = useSession();

  if (status === "loading") return <PageLoading lines={2} />;
  if (session?.user.role === allow) return children(session);

  const needed = m.auth.aRole[allow];
  return (
    <PageShell
      eyebrow={m.shell.eyebrow.gate}
      title={m.auth.gateTitle}
      intro={session ? undefined : m.auth.gateBody(needed)}
      width="narrow"
      size="compact"
    >
      <div data-testid="role-gate" className="flex flex-col items-center gap-4">
        {session ? (
          <Notice tone="warning" icon="alert" className="w-full">
            {m.auth.wrongRole(m.auth.aRole[session.user.role], needed)}
          </Notice>
        ) : null}
        <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href={`/sign-in?next=${encodeURIComponent(next)}`}>
            <Icon name="lock" />
            {m.auth.signInAs(needed)}
          </ButtonLink>
          {session ? (
            <Button variant="secondary" onClick={() => void signOut()}>
              {m.auth.signOut}
            </Button>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
