"use client";

import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Container, Loading, Notice, PageHeader } from "@/components/ui/page";
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

  if (status === "loading") {
    return (
      <Container>
        <Loading lines={2} />
      </Container>
    );
  }
  if (session?.user.role === allow) return children(session);

  const needed = m.auth.aRole[allow];
  return (
    <Container size="narrow">
      <PageHeader title={m.auth.gateTitle} />
      <div data-testid="role-gate" className="flex flex-col gap-4">
        {session ? (
          <>
            <Notice tone="warning" icon="alert">
              {m.auth.wrongRole(m.auth.aRole[session.user.role], needed)}
            </Notice>
            <Button
              variant="secondary"
              onClick={() => void signOut()}
              className="sm:self-start"
            >
              {m.auth.signOut}
            </Button>
          </>
        ) : (
          <p className="text-lg text-muted">{m.auth.gateBody(needed)}</p>
        )}
        <ButtonLink
          href={`/sign-in?next=${encodeURIComponent(next)}`}
          className="sm:self-start"
        >
          <Icon name="lock" />
          {m.auth.signInAs(needed)}
        </ButtonLink>
      </div>
    </Container>
  );
}
