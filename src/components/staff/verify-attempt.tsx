"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/page";
import { getApi, USING_FIXTURES } from "@/data/api";
import type { VerificationProbe } from "@/data/types";
import { useMessages } from "@/i18n";

/**
 * What a school sees on its own repair claim: the reason it cannot verify,
 * and one button that asks the ledger the same question and shows the
 * refusal. The probe never writes anything.
 */
export function VerifyAttempt({ issueId }: { issueId: string }) {
  const m = useMessages();
  const a = m.admin;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [probe, setProbe] = useState<VerificationProbe | null>(null);
  const helpId = `verify-help-${issueId}`;

  async function attempt() {
    setBusy(true);
    setFailed(false);
    try {
      setProbe(await getApi().probeVerification(issueId));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 font-semibold">
        <Icon name="lock" className="mt-0.5 size-5 text-muted" />
        {a.verifyDisabledReason}
      </p>
      <Button
        variant="secondary"
        size="lg"
        onClick={attempt}
        loading={busy}
        aria-describedby={helpId}
        className="no-print w-full"
      >
        <Icon name="shieldCheck" />
        {a.probe.action}
      </Button>
      <p id={helpId} className="no-print text-sm text-muted">
        {a.probeHelp}
      </p>
      <div aria-live="polite">
        {probe && !probe.allowed ? (
          <Notice tone="danger" icon="lock" title={a.probe.refusedTitle}>
            <div data-testid="probe-refusal">
              <p>{a.probe.refusedBody}</p>
              <dl className="mt-2 flex flex-col gap-2 text-sm">
                <div>
                  <dt className="font-semibold">{a.probe.reason}</dt>
                  <dd>
                    <code className="font-mono break-words">{probe.revert}</code>
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold">{a.probe.yourRole}</dt>
                  <dd>
                    <code className="font-mono break-words">{probe.chainRole}</code>
                  </dd>
                </div>
              </dl>
              {USING_FIXTURES ? <p className="mt-2 text-sm">{a.probe.sample}</p> : null}
            </div>
          </Notice>
        ) : null}
        {probe?.allowed ? <Notice tone="info">{a.probe.allowed}</Notice> : null}
        {failed ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {m.common.actionError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
