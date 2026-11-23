"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { getApi } from "@/data/api";
import type { MismatchExplanation, TrailMatch } from "@/data/types";
import { useMessages } from "@/i18n";
import { reasonSentence } from "@/shared";
import { formatRand } from "./money";

/**
 * What the rule engine decided about one invoice.
 *
 * The order of the parts is the point. First the result and the reasons the
 * rules gave, in a solid box. Under it, set apart on a soft panel, the plain
 * explanation: by Bona AI or written by code, labelled as which. The
 * explanation explains the rules; it decides nothing, and when it cannot be
 * loaded the result stands on its own.
 */
export function MatchResult({
  issueId,
  match,
  onCorrect,
  waitingForSupplier = false,
  showNext = true,
  explain,
}: {
  issueId: string;
  match: TrailMatch;
  /** The supplier's way back to the invoice. Omit for everyone else. */
  onCorrect?: () => void;
  /** For readers who are not the supplier, while this is the latest invoice. */
  waitingForSupplier?: boolean;
  /** On a matched invoice: say that the reviewer comes next. */
  showNext?: boolean;
  /** Where the explanation comes from. Defaults to the data layer. */
  explain?: () => Promise<MismatchExplanation>;
}) {
  const m = useMessages();
  const t = m.procurement.match;

  if (match.outcome === "matched") {
    return (
      <section
        data-testid="match-result"
        data-outcome="matched"
        aria-labelledby={`match-${match.id}`}
        className="flex gap-3 rounded-2xl border border-st-verified bg-st-verified-soft p-4"
      >
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-st-verified"
        >
          <Icon name="shieldCheck" className="size-6" />
        </span>
        <div className="min-w-0">
          <h3 id={`match-${match.id}`} className="text-xl font-semibold">
            {t.matchedTitle}
          </h3>
          <p>{t.matchedBody}</p>
          {showNext ? <p className="mt-1 text-muted">{t.matchedNext}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section
      data-testid="match-result"
      data-outcome="blocked"
      aria-labelledby={`match-${match.id}`}
      className="flex flex-col gap-4"
    >
      <div className="flex gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger text-on-brand"
        >
          <Icon name="alert" className="size-6" />
        </span>
        <div className="min-w-0">
          <h3 id={`match-${match.id}`} className="text-xl font-semibold">
            {t.blockedTitle}
          </h3>
          <p>
            {t.blockedCount(match.reasons.length)} {t.nothingApproved}
          </p>
        </div>
      </div>

      {/* The result: what the rules found, in the order the rules gave it. */}
      <div className="rounded-2xl border-2 border-line-strong bg-surface p-4">
        <h4 className="flex w-fit items-center rounded-full bg-sunken px-2.5 text-sm font-semibold tracking-wide text-muted uppercase">
          {t.found}
        </h4>
        <ol data-testid="match-reasons" className="mt-2 list-decimal space-y-1.5 pl-5">
          {match.reasons.map((reason, index) => (
            <li key={`${reason.code}-${reason.sku ?? index}`} data-reason={reason.code}>
              {reasonSentence(reason, formatRand)}
            </li>
          ))}
        </ol>
      </div>

      <Explanation
        key={match.id}
        load={explain ?? (() => getApi().explainMismatch(issueId, match.id))}
      />

      {onCorrect ? (
        <Button onClick={onCorrect} className="w-full sm:w-auto sm:self-start">
          {t.correct}
        </Button>
      ) : waitingForSupplier ? (
        <p className="text-muted">{t.waitingForSupplier}</p>
      ) : null}
    </section>
  );
}

/** The explanation, in a box that cannot be mistaken for the result. */
function Explanation({ load }: { load: () => Promise<MismatchExplanation> }) {
  const m = useMessages();
  const t = m.procurement.match;
  // undefined: loading. null: it failed, and the box is not shown.
  const [explanation, setExplanation] = useState<MismatchExplanation | null>();

  useEffect(() => {
    let current = true;
    load().then(
      (value) => current && setExplanation(value),
      () => current && setExplanation(null),
    );
    return () => {
      current = false;
    };
    // The parent gives this box a key per result, so it loads once per result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (explanation === null) return null;
  const byAi = explanation?.source === "ai";
  return (
    <div
      data-testid="match-explanation"
      data-source={explanation?.source ?? "loading"}
      aria-busy={explanation === undefined || undefined}
      className="rounded-2xl bg-sunken p-4"
    >
      {explanation === undefined ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{m.common.loading}</span>
          <Skeleton shape="text" />
          <Skeleton shape="text" className="w-3/4" />
        </div>
      ) : (
        <>
          <p
            className={
              byAi
                ? "inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent"
                : "inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm font-semibold text-muted"
            }
          >
            {byAi ? <Icon name="sparkle" className="size-4" /> : null}
            {byAi ? t.byAi : t.plain}
          </p>
          <p className="mt-2">{explanation.text}</p>
          <p className="mt-2 text-sm text-muted">{byAi ? t.aiNote : t.plainNote}</p>
        </>
      )}
    </div>
  );
}
