"use client";

import { useRef, useState } from "react";
import { LedgerChip } from "@/components/ledger-state";
import { ProofButton } from "@/components/proof/proof-button";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Dialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icon";
import type { IssueStatus, MoneyTrail } from "@/data/types";
import { useMessages, type Messages } from "@/i18n";
import { trailDateTime } from "./trail-rows";

type CheckKind = "done" | "problem" | "waiting";
interface Check {
  key: string;
  kind: CheckKind;
  text: string;
}

/**
 * The checklist of the gate, in plain words. The gate itself (`trail.gate`)
 * is decided by the shared rule, never here: this only picks the sentence for
 * each blocker from what the trail and the report status say.
 */
export function gateChecklist(
  trail: MoneyTrail,
  status: IssueStatus | null,
  m: Messages,
): Check[] {
  const g = m.procurement.gate;
  const blocked = new Set(trail.gate.blockers.map((blocker) => blocker.code));
  const checks: Check[] = [];

  checks.push(
    blocked.has("order_not_acknowledged")
      ? { key: "acknowledged", kind: "waiting", text: g.acknowledged.waiting }
      : { key: "acknowledged", kind: "done", text: g.acknowledged.cleared },
  );

  if (!blocked.has("no_matching_invoice")) {
    checks.push({ key: "invoice", kind: "done", text: g.invoice.cleared });
  } else if (trail.invoices.length === 0) {
    checks.push({ key: "invoice", kind: "waiting", text: g.invoice.none });
  } else if (
    !trail.receipts.some((receipt) => receipt.orderVersion === trail.order.version)
  ) {
    checks.push({ key: "invoice", kind: "waiting", text: g.invoice.noDelivery });
  } else {
    checks.push({ key: "invoice", kind: "problem", text: g.invoice.blocked });
  }

  if (!blocked.has("repair_not_verified")) {
    checks.push({ key: "repair", kind: "done", text: g.repair.cleared });
  } else if (status === "disputed") {
    checks.push({ key: "repair", kind: "problem", text: g.repair.disputed });
  } else if (status === "repair_claimed" || status === null) {
    checks.push({ key: "repair", kind: "waiting", text: g.repair.claimed });
  } else {
    checks.push({ key: "repair", kind: "waiting", text: g.repair.earlier });
  }

  if (blocked.has("same_person")) {
    checks.push({ key: "same_person", kind: "problem", text: g.samePerson });
  }
  return checks;
}

const CHECK_STYLE: Record<CheckKind, { icon: IconName; tone: string }> = {
  done: { icon: "check", tone: "bg-st-verified-soft text-st-verified" },
  problem: { icon: "alert", tone: "bg-danger-soft text-danger" },
  waiting: { icon: "clock", tone: "bg-accent-soft text-accent" },
};

/**
 * The release gate: a lock with a checklist. Locked, it says in plain words
 * what must still happen and offers nothing to press that does anything.
 * Open, it offers one button, behind a confirmation. Authorised, it shows
 * when, and the proof. It never shows an amount: the order total is in the
 * trail. No money moves here; a release is an instruction.
 */
export function ReleaseGate({
  trail,
  status,
  onAuthorise,
  conflict = false,
  byYou = false,
}: {
  trail: MoneyTrail;
  /** The report's public status, to say who the gate is waiting for. */
  status: IssueStatus | null;
  /** Called after the person confirms. Omit for people who cannot authorise. */
  onAuthorise?: () => Promise<void>;
  /** The last attempt was refused because something changed on the case. */
  conflict?: boolean;
  /** The reader is the person who authorised. */
  byYou?: boolean;
}) {
  const m = useMessages();
  const g = m.procurement.gate;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");
  const firstBlocking = useRef<HTMLLIElement>(null);

  const released = trail.releaseAuthorisedAt;
  const state = released ? "authorised" : trail.gate.open ? "open" : "locked";
  const checks = gateChecklist(trail, status, m);
  const blocking = checks.filter((check) => check.kind !== "done");
  const firstBlockingKey = blocking[0]?.key;
  const step = trail.steps.findLast((entry) => entry.type === "release_authorised");

  async function authorise() {
    if (!onAuthorise) return;
    setBusy(true);
    try {
      await onAuthorise();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const head = {
    locked: {
      icon: "lock",
      ground: "bg-sunken text-muted",
      title: g.lockedTitle,
      body: g.lockedCount(blocking.length),
    },
    open: {
      icon: "lockOpen",
      ground: "bg-st-verified-soft text-st-verified",
      title: g.openTitle,
      body: g.openBody,
    },
    authorised: {
      icon: "shieldCheck",
      ground: "bg-st-verified-soft text-st-verified",
      title: g.doneTitle,
      body: released ? (byYou ? g.doneByYou : g.doneAt)(trailDateTime(released)) : "",
    },
  } as const;
  const { icon, ground, title, body } = head[state];

  return (
    <section
      data-testid="release-gate"
      data-gate={state}
      aria-labelledby="release-gate-title"
      className="flex flex-col gap-4"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full motion-safe:transition-colors motion-safe:duration-200",
            ground,
          )}
        >
          <Icon name={icon} className="size-6" />
        </span>
        <div className="min-w-0">
          <h3 id="release-gate-title" className="text-xl font-semibold">
            {title}
          </h3>
          <p data-testid="gate-summary" className="text-muted">
            {body}
          </p>
        </div>
      </div>

      {conflict ? <Alert tone="danger" live title={g.conflict} /> : null}

      {state === "authorised" ? (
        step ? (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            <LedgerChip record={step.ledger} />
            <ProofButton
              issueId={trail.issueId}
              recordId={step.eventId}
              label={g.doneTitle}
              ledger={step.ledger}
              withDocument
              reportId={trail.issueId}
            />
          </div>
        ) : null
      ) : (
        /* Tailwind resets list-style, and Safari then drops the list role; say it explicitly. */
        /* eslint-disable-next-line jsx-a11y/no-redundant-roles */
        <ul
          role="list"
          aria-label={g.checklist}
          data-testid="gate-checklist"
          className="flex flex-col gap-2.5"
        >
          {checks.map((check) => {
            const style = CHECK_STYLE[check.kind];
            return (
              <li
                key={check.key}
                ref={check.key === firstBlockingKey ? firstBlocking : undefined}
                tabIndex={check.key === firstBlockingKey ? -1 : undefined}
                data-check={check.key}
                data-kind={check.kind}
                className="flex items-start gap-3 rounded-lg"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    style.tone,
                  )}
                >
                  <Icon name={style.icon} className="size-4" />
                </span>
                <span
                  className={cn(
                    "pt-0.5",
                    check.kind === "done" ? "text-muted" : "font-semibold",
                  )}
                >
                  <span className="sr-only">{g.state[check.kind]} </span>
                  {check.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {state === "locked" ? (
        <>
          {/*
            Not a working button. It stays focusable so a keyboard reaches it,
            and pressing it only points at what must happen first.
          */}
          <Button
            variant="secondary"
            aria-disabled="true"
            onClick={() => {
              setAnnounce(g.lockedAnnounce(blocking.length));
              firstBlocking.current?.focus();
            }}
            className="w-full cursor-not-allowed opacity-70 sm:w-auto sm:self-start"
          >
            <Icon name="lock" />
            {g.lockedButton}
          </Button>
          <p aria-live="polite" className="sr-only">
            {announce}
          </p>
        </>
      ) : null}

      {state === "open" && onAuthorise ? (
        <>
          <Button
            onClick={() => setConfirming(true)}
            className="w-full sm:w-auto sm:self-start"
          >
            {g.authorise}
          </Button>
          <Dialog
            open={confirming}
            onClose={() => setConfirming(false)}
            title={g.confirmTitle(trail.reference)}
            description={g.confirmBody}
            size="sm"
            footer={
              <>
                <Button
                  loading={busy}
                  onClick={() => void authorise()}
                  data-testid="confirm-release"
                >
                  {g.authorise}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setConfirming(false)}
                >
                  {m.common.cancel}
                </Button>
              </>
            }
          >
            <p className="text-sm text-muted">{m.procurement.testnet}</p>
          </Dialog>
        </>
      ) : null}
    </section>
  );
}
