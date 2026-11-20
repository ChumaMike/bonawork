"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  formatRecordedAt,
  matchOutcomeWords,
  plainAnswer,
  SAMPLE_ANSWER,
  stepName,
  type PlainAnswer,
  type Tone,
} from "../lib/plain";
import type { Overall, RegistryEvent, VerifyResult } from "../lib/verify";
import { CARD, Icon, SECONDARY_BUTTON, type IconName } from "./parts";

/** What this site is set up to trust. Decided on the server, shown under Technical details. */
export interface Trust {
  chainId: number;
  /** "Avalanche Fuji test network". */
  network: string;
  rpcHost: string;
  /** The one contract whose receipts are accepted, or null when none is pinned. */
  contract: string | null;
}

/** The answer to one check. */
export type Outcome =
  | {
      kind: "result";
      result: VerifyResult;
      event: RegistryEvent;
      /** The word for what was checked: "photo", "file", "report". */
      noun: string;
      receipt: unknown;
      /** The caption a link carried, if any. */
      label?: string;
    }
  /** A receipt from BonaBlock's practice data. No network call was made. */
  | { kind: "sample"; receipt: unknown };

const TONE_CARD: Record<Tone, string> = {
  good: "border-good bg-good-soft text-good",
  bad: "border-danger bg-danger-soft text-danger",
  warn: "border-accent bg-accent-soft text-accent",
  neutral: "border-line-strong bg-sunken text-ink",
  // Dashed: visibly a placeholder, never mistaken for a real record.
  sample: "border-dashed border-accent bg-accent-soft text-accent",
};

const TONE_BADGE: Record<Tone, string> = {
  good: "bg-good text-on-brand",
  bad: "bg-danger text-on-brand",
  warn: "bg-accent text-on-brand",
  neutral: "bg-muted text-on-brand",
  sample: "bg-accent text-on-brand",
};

const OVERALL_ICON: Record<Overall, IconName> = {
  VERIFIED: "check",
  RECORDED: "check",
  MISMATCH: "cross",
  NOT_FOUND: "search",
  REJECTED: "noEntry",
  CANNOT_VERIFY: "broken",
};

/**
 * The one big answer, then two or three facts, then everything technical
 * behind a closed "Technical details".
 */
export function ResultView({
  outcome,
  trust,
  onRetry,
}: {
  outcome: Outcome | null;
  trust: Trust;
  /** Offered when the network could not be reached. */
  onRetry?: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Bring the answer into view and tell assistive technology where it is.
  useEffect(() => {
    if (!outcome || !heading.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.current.focus({ preventScroll: true });
    heading.current.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
  }, [outcome]);

  let answer: PlainAnswer | null = null;
  let code = "";
  let icon: IconName = "info";
  if (outcome?.kind === "sample") {
    answer = SAMPLE_ANSWER;
    code = "SAMPLE";
  } else if (outcome) {
    answer = plainAnswer(outcome.result, {
      event: outcome.event,
      noun: outcome.noun,
      network: trust.network,
    });
    code = outcome.result.overall;
    icon = OVERALL_ICON[outcome.result.overall];
  }
  const result = outcome?.kind === "result" ? outcome.result : null;
  const facts = result?.facts;

  return (
    <div className="mt-4 scroll-mt-4">
      {/* Always in the page, so a screen reader announces the answer when it appears. */}
      <div role="status" aria-live="polite">
        {answer ? (
          <div
            data-outcome={code}
            className={`flex flex-col items-center rounded-xl border-2 px-4 py-5 text-center ${TONE_CARD[answer.tone]}`}
          >
            <span
              className={`flex size-12 items-center justify-center rounded-full ${TONE_BADGE[answer.tone]}`}
            >
              <Icon name={icon} className="size-7" />
            </span>
            <h2
              ref={heading}
              tabIndex={-1}
              className="mt-3 text-2xl font-bold focus:outline-none"
            >
              {answer.title}
            </h2>
            <p className="mt-1 text-base font-medium text-ink">{answer.body}</p>
            {answer.note ? <p className="mt-2 text-sm text-ink">{answer.note}</p> : null}
          </div>
        ) : null}
      </div>

      {result?.overall === "VERIFIED" && facts ? (
        <dl className={`${CARD} mt-3 py-1`}>
          {facts.eventTimestamp ? (
            <Row name="Recorded">{formatRecordedAt(facts.eventTimestamp)}</Row>
          ) : null}
          <Row name="By the Bona Chain contract">
            {result.verifier.expectedContractAddress ||
            result.verifier.expectedFactoryAddress ? (
              <span className="text-good">Yes</span>
            ) : (
              <span className="font-medium text-muted">Not checked here</span>
            )}
          </Row>
          <Row name="Network">{trust.network}</Row>
        </dl>
      ) : null}

      {/*
        Recorded, not compared: say exactly what was read from the blockchain.
        The contract and the fingerprint are shown here, not only under
        Technical details, because they are the whole of what this answer rests on.
      */}
      {outcome?.kind === "result" && result?.overall === "RECORDED" && facts ? (
        <dl className={`${CARD} mt-3 py-1`} data-testid="recorded-facts">
          <Row name="Step">{stepName(outcome.event)}</Row>
          {outcome.event === "MatchRecorded" && facts.matchPassed !== undefined ? (
            <Row name="Result">{matchOutcomeWords(facts.matchPassed)}</Row>
          ) : null}
          {facts.eventTimestamp ? (
            <Row name="Recorded">{formatRecordedAt(facts.eventTimestamp)}</Row>
          ) : null}
          {facts.blockNumber !== undefined ? (
            <Row name="Block">{facts.blockNumber}</Row>
          ) : null}
          {facts.contractAddress ? (
            <Row name="Contract" code>
              {facts.contractAddress}
            </Row>
          ) : null}
          <Row
            name={
              facts.contractKind === "operations" || facts.contractKind === "finance"
                ? "Created by the Bona Chain factory"
                : "By the Bona Chain contract"
            }
          >
            {result.verifier.expectedContractAddress ||
            result.verifier.expectedFactoryAddress ? (
              <span className="text-good">Yes</span>
            ) : (
              <span className="font-medium text-muted">Not checked here</span>
            )}
          </Row>
          {facts.onChainValue ? (
            <Row name="Fingerprint on the blockchain" code>
              {facts.onChainValue}
            </Row>
          ) : null}
          <Row name="Network">{trust.network}</Row>
        </dl>
      ) : null}

      {result?.overall === "CANNOT_VERIFY" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className={`${SECONDARY_BUTTON} no-print mt-3 w-full`}
        >
          Try again
        </button>
      ) : null}

      {/* Only for a transaction that exists: otherwise there is nothing to see there. */}
      {facts?.explorerUrl && facts.blockNumber !== undefined ? (
        <a
          href={facts.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className={`${SECONDARY_BUTTON} no-print mt-3 w-full`}
        >
          See it on Snowtrace
          <Icon name="external" className="size-4" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ) : null}

      {outcome ? <Technical outcome={outcome} trust={trust} /> : null}
    </div>
  );
}

function Row({
  name,
  code = false,
  children,
}: {
  name: string;
  /** A long code (an address, a fingerprint): its own line, set so it can wrap. */
  code?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-muted">{name}</dt>
      <dd className={code ? "w-full font-mono text-sm break-all" : "font-semibold"}>
        {children}
      </dd>
    </div>
  );
}

/** Fingerprints, transaction, block, chain, contract, RPC node, steps and the raw receipt. */
function Technical({ outcome, trust }: { outcome: Outcome; trust: Trust }) {
  const result = outcome.kind === "result" ? outcome.result : null;
  const facts = result?.facts;
  return (
    <details className={`${CARD} group mt-3 py-0`} data-testid="technical-details">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-semibold [&::-webkit-details-marker]:hidden">
        Technical details
        <Icon
          name="chevron"
          className="size-5 text-muted transition-transform group-open:rotate-90"
        />
      </summary>
      <div className="border-t border-line pt-3 pb-4 text-sm">
        <dl className="grid grid-cols-1 gap-y-1 sm:grid-cols-[auto_1fr] sm:gap-x-4 sm:gap-y-2">
          <Fact
            name="Result code"
            value={result ? result.overall : "SAMPLE (no network call was made)"}
            testId="result-code"
          />
          <Fact name="What the check said" value={result?.summary} plain />
          <Fact
            name="Fingerprint of what you chose"
            value={facts?.recomputedDigest}
            testId="file-digest"
          />
          <Fact name="Fingerprint on the blockchain" value={facts?.onChainValue} />
          <Fact name="Transaction" value={facts?.txHash} href={facts?.explorerUrl} />
          <Fact name="Block" value={facts?.blockNumber?.toString()} />
          <Fact name="Recorded at (UTC)" value={facts?.eventTimestamp} />
          <Fact name="Record type" value={facts?.eventName} />
          <Fact name="Report id on the blockchain" value={facts?.reportIdOnChain} />
          <Fact name="Report id expected" value={facts?.reportIdExpected} />
          <Fact name="Chain id" value={`eip155:${trust.chainId}`} />
          <Fact name="Contract in the receipt" value={facts?.contractAddress} />
          <Fact
            name="Contract this site trusts"
            value={trust.contract ?? "not pinned: the receipt's own address is used"}
          />
          <Fact name="RPC node" value={trust.rpcHost} />
        </dl>

        {result ? (
          <>
            <h3 className="mt-4 font-semibold">Checks, step by step</h3>
            <ol className="mt-1 divide-y divide-line">
              {result.steps.map((step, index) => (
                <li key={step.id} className="flex gap-2 py-2">
                  <span
                    aria-hidden="true"
                    className={`w-5 shrink-0 text-center font-bold ${
                      step.status === "pass"
                        ? "text-good"
                        : step.status === "fail"
                          ? "text-danger"
                          : "text-muted"
                    }`}
                  >
                    {step.status === "pass" ? "✓" : step.status === "fail" ? "✗" : "–"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="sr-only">
                        {index + 1}.{" "}
                        {step.status === "pass"
                          ? "Passed: "
                          : step.status === "fail"
                            ? "Failed: "
                            : "Skipped: "}
                      </span>
                      {step.title}
                    </p>
                    <p className="text-muted [overflow-wrap:anywhere]">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        ) : null}

        <h3 className="mt-4 font-semibold">Receipt</h3>
        <pre
          data-testid="raw-receipt"
          className="mt-1 rounded-lg bg-sunken p-3 font-mono text-xs whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          {JSON.stringify(outcome.receipt, null, 2)}
        </pre>
        {outcome.kind === "result" && outcome.label ? (
          <p className="mt-2 text-muted">
            The name &ldquo;{outcome.label}&rdquo; came with the link and is not part of
            the check. The check is on the transaction above.
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => window.print()}
          className={`${SECONDARY_BUTTON} no-print mt-4`}
        >
          Print this result
        </button>
      </div>
    </details>
  );
}

function Fact({
  name,
  value,
  href,
  plain = false,
  testId,
}: {
  name: string;
  value?: string;
  href?: string;
  /** Ordinary words rather than a code. */
  plain?: boolean;
  testId?: string;
}) {
  if (!value) return null;
  return (
    <>
      <dt className="mt-2 font-medium text-muted first:mt-0 sm:mt-0">{name}</dt>
      <dd
        data-testid={testId}
        className={plain ? "[overflow-wrap:anywhere]" : "font-mono break-all"}
      >
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center py-1 text-brand underline"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </>
  );
}
