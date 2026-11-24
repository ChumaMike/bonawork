"use client";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

/** On the case page: the way to the case's escrow on Solana devnet. */
export function EscrowCard({ issueId, role }: { issueId: string; role: string | null }) {
  return (
    <Card data-testid="escrow-card" className="flex flex-col gap-3">
      <h2 className="text-xl">Repair money</h2>
      <p className="text-[0.95rem] text-muted">
        Sandbox rand held in an escrow on Solana devnet, released in two stages after
        independent review.
      </p>
      <ButtonLink
        href={`/issues/${issueId}/escrow`}
        variant={role === "buyer" ? "primary" : "secondary"}
        className="w-full"
      >
        {role === "buyer" ? "Fund this repair" : "See the escrow"}
        <Icon name="arrowRight" className="size-5" />
      </ButtonLink>
    </Card>
  );
}
