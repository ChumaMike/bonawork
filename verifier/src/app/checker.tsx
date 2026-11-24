"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { computeCommitment, isUuid, sha256Hex, type Hex32 } from "../lib/canonical";
import { nothingToCompare, nounFor, RECORD_NAME } from "../lib/plain";
import {
  checkDocument,
  documentWords,
  readDocument,
  readRecord,
  type RecordRead,
  type RecordToCheck,
} from "../lib/record";
import type { VerifyResult } from "../lib/verify";
import {
  CARD,
  FileBox,
  Icon,
  LINK_BUTTON,
  PasteBox,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "./parts";
import { ResultView, type Outcome, type Trust } from "./result";

/** A record that came with the link or square code that opened the site. */
export type Arrived = Extract<RecordRead, { kind: "record" | "sample" }>;

interface DocumentState {
  document: Record<string, unknown> | null;
  problem: string | null;
  detail?: string;
}

const NO_DOCUMENT: DocumentState = { document: null, problem: null };

/** The document a link or a pasted receipt brought with it, checked before use. */
function documentOf(record: RecordToCheck | null): DocumentState {
  if (!record || record.mode !== "document" || !record.document) return NO_DOCUMENT;
  const read = checkDocument(record.document, record.event);
  return read.ok
    ? { document: read.document, problem: null }
    : { document: null, problem: read.problem, detail: read.detail };
}

interface CheckInput {
  record: RecordToCheck;
  file: File | null;
  document: Record<string, unknown> | null;
  /** Typed by hand, only ever for an acknowledgement. */
  reportId: string;
  /**
   * The record's details are not at hand (a public link carries none): check
   * only that the record is on the blockchain, and by which contract.
   */
  presence?: boolean;
}

type CheckRun =
  { ok: true; outcome: Outcome } | { ok: false; message: string; detail?: string };

/**
 * Fingerprint the content on this device, then ask this site's own
 * `/api/verify` to read Avalanche and compare. Only the fingerprint and the
 * receipt are sent: the file and the document stay here. BonaBlock is never
 * called.
 */
async function runCheck({
  record,
  file,
  document,
  reportId,
  presence = false,
}: CheckInput): Promise<CheckRun> {
  let digest: Hex32 | undefined;
  let noun = nounFor(record.event);
  let report = record.reportId ?? (reportId.trim() || undefined);
  let workOrderId: string | undefined;
  let matchPassed: boolean | undefined;
  try {
    if (record.mode === "evidence") {
      if (!file) return { ok: false, message: "Choose your photo or document first." };
      digest = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
      noun = nounFor(record.event, file.type);
    } else if (record.mode === "document" && !document) {
      // Nothing to fingerprint. With `presence` the receipt alone is sent, and
      // this site answers whether the record is on the blockchain.
      if (!presence) return { ok: false, message: "Add the record's details first." };
    } else if (record.mode === "document" && document) {
      digest = await computeCommitment(document);
      // The document names its own report: that is the one to compare with.
      if (typeof document.reportId === "string") report = document.reportId;
      // Two more things the ledger holds next to a finance fingerprint. They are
      // read from the document here, so the document itself still never leaves.
      if (typeof document.workOrderId === "string") workOrderId = document.workOrderId;
      if (record.event === "MatchRecorded") matchPassed = document.outcome === "pass";
    }
  } catch (error) {
    return {
      ok: false,
      message: "This device could not read that file. Please choose it again.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  if (report && !isUuid(report)) {
    return {
      ok: false,
      message:
        "The report id is not in the right form. Clear it, or copy it again from BonaWork.",
    };
  }

  let response: Response;
  try {
    response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receipt: record.receipt,
        digest,
        reportId: report,
        workOrderId,
        matchPassed,
      }),
    });
  } catch (error) {
    return {
      ok: false,
      message: "This site could not be reached. Check your connection and try again.",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  let body: VerifyResult | { error: string };
  try {
    body = (await response.json()) as VerifyResult | { error: string };
  } catch {
    return {
      ok: false,
      message: "The check did not finish. Please try again.",
      detail: `HTTP ${response.status}`,
    };
  }
  if (!response.ok || "error" in body) {
    return {
      ok: false,
      message: "The check did not finish. Please try again.",
      detail: "error" in body ? body.error : `HTTP ${response.status}`,
    };
  }
  return {
    ok: true,
    outcome: {
      kind: "result",
      result: body,
      event: record.event,
      noun,
      receipt: record.receipt,
      label: record.label,
    },
  };
}

/**
 * One screen, two ways in.
 *
 * Opened from a link or a square code (`arrived` set): the record is already
 * filled in. The person only chooses their photo or document and reads one
 * answer; a record with nothing to choose is checked straight away.
 *
 * Opened by "Paste a receipt instead": two steps, paste the receipt, then
 * choose the photo or document, then Check. The page works out the kind of
 * record from the receipt, so nobody picks a type or types a report id.
 */
export function Checker({
  trust,
  arrived,
  onLeave,
}: {
  trust: Trust;
  arrived?: Arrived;
  /** Go back to the opening screen. */
  onLeave: () => void;
}) {
  const fromLink = arrived !== undefined;
  const [read, setRead] = useState<Arrived | null>(arrived ?? null);
  const record = read?.kind === "record" ? read.record : null;

  const [receiptProblem, setReceiptProblem] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [doc, setDoc] = useState<DocumentState>(() =>
    documentOf(arrived?.kind === "record" ? arrived.record : null),
  );
  const [reportId, setReportId] = useState("");
  /**
   * A record that arrived needing nothing from the person (an acknowledgement,
   * or a document that came in the link) is checked as soon as the screen opens.
   * So is a record whose details did not come with the link, as on a public
   * page: this site then answers whether it is on the blockchain, and the
   * details can still be pasted afterwards for the full check.
   */
  const [onArrival] = useState<CheckInput | null>(() => {
    if (arrived?.kind !== "record") return null;
    const { document } = documentOf(arrived.record);
    const { mode } = arrived.record;
    return mode === "acknowledgement" || mode === "document"
      ? {
          record: arrived.record,
          file: null,
          document,
          reportId: "",
          presence: document === null,
        }
      : null;
  });
  const [checking, setChecking] = useState(onArrival !== null);
  const [failure, setFailure] = useState<{ message: string; detail?: string } | null>(
    null,
  );
  const [outcome, setOutcome] = useState<Outcome | null>(
    arrived?.kind === "sample" ? { kind: "sample", receipt: arrived.receipt } : null,
  );

  /** Counts checks, so an answer that arrives late for an older input is dropped. */
  const latest = useRef(0);
  const title = useRef<HTMLHeadingElement>(null);
  const receiptRead = useRef<HTMLParagraphElement>(null);
  /** True once the person has pressed Change: the box that comes back takes the focus. */
  const [changed, setChanged] = useState(false);
  const ids = { title: useId(), ready: useId(), report: useId(), reportHelp: useId() };

  function finish(run: CheckRun) {
    setChecking(false);
    if (run.ok) setOutcome(run.outcome);
    else setFailure({ message: run.message, detail: run.detail });
  }

  async function check(input: CheckInput) {
    const turn = ++latest.current;
    setChecking(true);
    setFailure(null);
    setOutcome(null);
    const run = await runCheck(input);
    if (turn === latest.current) finish(run);
  }

  /** Something the person supplied changed: the old answer no longer applies. */
  function clearAnswer() {
    latest.current++;
    setChecking(false);
    setFailure(null);
    setOutcome(null);
  }

  useEffect(() => {
    // Arriving from "Paste a receipt instead": start reading from the heading.
    if (!fromLink) title.current?.focus({ preventScroll: true });
    if (!onArrival) return;
    let left = false;
    const turn = ++latest.current;
    void runCheck(onArrival).then((run) => {
      // Dropped when the screen has gone, or the person has since changed something.
      if (!left && turn === latest.current) finish(run);
    });
    return () => {
      left = true;
    };
    // Runs once: this screen is created afresh for each link (it is keyed by the fragment).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Paste button goes away once a receipt is read. Put the focus on what replaced it.
  const hasRecord = record !== null;
  useEffect(() => {
    if (!fromLink && hasRecord) receiptRead.current?.focus({ preventScroll: true });
  }, [fromLink, hasRecord]);

  function onReceiptText(text: string) {
    const next = readRecord(text);
    if (next.kind === "empty") {
      setReceiptProblem(null);
    } else if (next.kind === "record") {
      clearAnswer();
      setReceiptProblem(null);
      setRead(next);
      setDoc(documentOf(next.record));
    } else if (next.kind === "sample") {
      clearAnswer();
      setReceiptProblem(null);
      setRead(next);
      setOutcome({ kind: "sample", receipt: next.receipt });
    } else if (next.kind === "document") {
      setReceiptProblem(
        "That is the record's details, not its receipt. In BonaWork, tap Copy receipt on the record, then paste again.",
      );
    } else {
      setReceiptProblem(
        "That is not a BonaWork receipt. In BonaWork, tap Copy receipt on the record, then paste again.",
      );
    }
  }

  function changeReceipt() {
    clearAnswer();
    setChanged(true);
    setRead(null);
    setDoc(NO_DOCUMENT);
    setReportId("");
  }

  function onFile(chosen: File) {
    clearAnswer();
    setFile(chosen);
    if (fromLink && record) {
      void check({ record, file: chosen, document: null, reportId: "" });
    }
  }

  function onDocumentText(text: string) {
    if (!record) return;
    if (!text.trim()) {
      setDoc(NO_DOCUMENT);
      return;
    }
    const next = readDocument(text, record.event);
    if (!next.ok) {
      setDoc({ document: null, problem: next.problem, detail: next.detail });
      return;
    }
    clearAnswer();
    setDoc({ document: next.document, problem: null });
    if (fromLink)
      void check({ record, file: null, document: next.document, reportId: "" });
  }

  /**
   * Opened from a link whose record is not a file and whose details are not
   * here: the answer is "recorded", and pasting the details is a second step.
   */
  const presenceOnly = fromLink && record?.mode === "document" && doc.document === null;
  const ready =
    record !== null &&
    (record.mode === "evidence"
      ? file !== null
      : record.mode === "document"
        ? doc.document !== null || presenceOnly
        : true);
  const current: CheckInput | null = record
    ? { record, file, document: doc.document, reportId, presence: presenceOnly }
    : null;

  /** What the person supplies for this record, apart from the receipt. */
  let supply: ReactNode = null;
  if (record?.mode === "evidence") {
    supply = <FileBox file={file} onFile={onFile} />;
  } else if (record?.mode === "document") {
    supply = doc.document ? (
      <DocumentRead
        document={doc.document}
        // Details that came with the record are part of it: nothing to change.
        {...(record.document === doc.document
          ? {}
          : {
              focusOnMount: true,
              onChange: () => {
                clearAnswer();
                setChanged(true);
                setDoc(NO_DOCUMENT);
                // Back to what can be said without the details.
                if (fromLink) {
                  void check({
                    record,
                    file: null,
                    document: null,
                    reportId: "",
                    presence: true,
                  });
                }
              },
            })}
      />
    ) : (
      <>
        {record.documentDamaged ? (
          <p className="mb-2 text-sm font-medium text-accent">
            The link was cut short, so the record&rsquo;s details are missing.
          </p>
        ) : null}
        <PasteBox
          buttonLabel="Paste the record's details"
          hint="In BonaWork, tap Copy document on the same record first. The details stay on your device."
          emptyHint="In BonaWork, tap Copy document on the same record first."
          fieldLabel="The record's details"
          uploadLabel="Upload the saved details"
          problem={doc.problem}
          problemDetail={doc.detail}
          focusOnMount={changed}
          onText={onDocumentText}
        />
      </>
    );
  } else if (record?.mode === "acknowledgement" && !fromLink) {
    supply = (
      <>
        <p className="text-muted">{nothingToCompare(record.event)}</p>
        {record.reportId ? null : (
          <details className="mt-2">
            <summary className="cursor-pointer py-2.5 font-semibold text-brand">
              Check it is for one particular report (optional)
            </summary>
            <label htmlFor={ids.report} className="mt-1 block text-sm font-semibold">
              Report id
            </label>
            <input
              id={ids.report}
              aria-describedby={ids.reportHelp}
              value={reportId}
              onChange={(event) => {
                clearAnswer();
                setReportId(event.target.value);
              }}
              className="mt-1 min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3 font-mono text-base"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <p id={ids.reportHelp} className="mt-1 text-sm text-muted">
              The report&rsquo;s long id from BonaWork: letters and numbers with dashes.
              Leave it empty to check only that the acknowledgement was recorded.
            </p>
          </details>
        )}
      </>
    );
  }

  const supplyTitle =
    record?.mode === "document"
      ? "The record's details"
      : record?.mode === "acknowledgement"
        ? "Nothing more needed"
        : "Your photo or document";

  return (
    <section aria-labelledby={ids.title}>
      <h1
        id={ids.title}
        ref={title}
        tabIndex={-1}
        className="text-2xl font-bold tracking-tight focus:outline-none sm:text-3xl"
      >
        {fromLink ? "Check this record" : "Check a record on Avalanche"}
      </h1>

      {fromLink ? (
        <>
          <div className={`${CARD} mt-4 flex items-center gap-3`} data-testid="checking">
            <Icon name="file" className="size-6 text-brand" />
            <p className="min-w-0">
              <span className="block text-sm text-muted">Checking</span>
              <span className="block font-semibold [overflow-wrap:anywhere]">
                {record ? (record.label ?? RECORD_NAME[record.event]) : "A sample record"}
              </span>
            </p>
          </div>
          {/* Without the details the answer comes first; pasting them is offered below it. */}
          {supply && !presenceOnly ? <div className="mt-3">{supply}</div> : null}
        </>
      ) : (
        <>
          <p className="mt-2 text-muted">
            This site does not ask BonaWork anything. It reads the {trust.network} itself.
          </p>

          <Step number={1} title="Your receipt" done={read !== null}>
            {read ? (
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <p ref={receiptRead} tabIndex={-1} data-testid="receipt-read">
                  {record ? (
                    <>
                      It is for{" "}
                      <span className="font-semibold">
                        {lowerFirst(RECORD_NAME[record.event])}
                      </span>
                      .
                    </>
                  ) : (
                    "It is a sample receipt."
                  )}
                </p>
                <button type="button" onClick={changeReceipt} className={LINK_BUTTON}>
                  Change
                </button>
              </div>
            ) : (
              <PasteBox
                buttonLabel="Paste receipt"
                primary
                hint="In BonaWork, tap Copy receipt on any record first."
                emptyHint="In BonaWork, tap Copy receipt on a record first."
                fieldLabel="Receipt"
                uploadLabel="Upload a receipt file"
                problem={receiptProblem}
                focusOnMount={changed}
                onText={onReceiptText}
              />
            )}
          </Step>

          {read?.kind === "sample" ? null : (
            <Step number={2} title={supplyTitle} waiting={record === null} done={ready}>
              {supply ?? (
                <p className="text-muted">
                  Next you choose the photo or document the receipt is for. It never
                  leaves your device.
                </p>
              )}
            </Step>
          )}

          {read?.kind === "sample" ? null : (
            <>
              <button
                type="button"
                disabled={!ready || checking}
                aria-describedby={ids.ready}
                onClick={() => {
                  if (current) void check(current);
                }}
                className={`${PRIMARY_BUTTON} no-print mt-4 min-h-14 text-lg`}
              >
                {checking ? "Checking…" : "Check"}
              </button>
              <p id={ids.ready} className="mt-2 text-center text-sm text-muted">
                {!record
                  ? "Paste your receipt first."
                  : !ready
                    ? record.mode === "document"
                      ? "Add the record's details, then check."
                      : "Choose your photo or document, then check."
                    : record.mode === "acknowledgement"
                      ? "This site then reads the blockchain itself."
                      : "Only a fingerprint is sent to this site. What you chose stays on your device."}
              </p>
            </>
          )}
        </>
      )}

      <p role="status" aria-live="polite" className="mt-3 text-center text-muted">
        {checking ? "Reading Avalanche. This usually takes a few seconds." : ""}
      </p>

      {failure ? (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-danger"
        >
          <p className="font-medium">{failure.message}</p>
          {failure.detail ? (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer py-2.5">Technical details</summary>
              <p className="font-mono [overflow-wrap:anywhere]">{failure.detail}</p>
            </details>
          ) : null}
          {current && ready ? (
            <button
              type="button"
              onClick={() => {
                void check(current);
              }}
              className={`${SECONDARY_BUTTON} no-print mt-2`}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      <ResultView
        outcome={outcome}
        trust={trust}
        onRetry={
          current
            ? () => {
                void check(current);
              }
            : undefined
        }
      />

      {presenceOnly && supply ? (
        <section className={`${CARD} no-print mt-4`} data-testid="hold-the-record">
          <h2 className="text-lg font-semibold">Do you hold this record?</h2>
          <p className="mt-1 mb-3 text-muted">
            Paste its details to check that they match the fingerprint on the blockchain.
            They stay on your device.
          </p>
          {supply}
        </section>
      ) : null}

      <p className="no-print mt-6 text-center">
        <button type="button" onClick={onLeave} className={LINK_BUTTON}>
          {fromLink ? "Check a different record" : "Scan a code instead"}
        </button>
      </p>
    </section>
  );
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** A numbered step of the paste screen. */
function Step({
  number,
  title,
  done = false,
  waiting = false,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  /** Not this step's turn yet. */
  waiting?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`${CARD} mt-4`} data-step={number}>
      <h2 className="flex items-center gap-2.5 text-lg font-semibold">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold text-on-brand ${
            waiting ? "bg-line-strong" : "bg-brand"
          }`}
        >
          {done ? (
            <>
              <Icon name="check" className="size-4" />
              <span className="sr-only">Step {number}, done:</span>
            </>
          ) : (
            <>
              <span className="sr-only">Step </span>
              {number}
              <span className="sr-only">:</span>
            </>
          )}
        </span>
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The record's details are in hand: say so, and let the person read them. */
function DocumentRead({
  document,
  onChange,
  focusOnMount = false,
}: {
  document: Record<string, unknown>;
  onChange?: () => void;
  /** True when this took the place of the paste box the person just used. */
  focusOnMount?: boolean;
}) {
  const words = documentWords(document);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusOnMount) box.current?.focus({ preventScroll: true });
    // Only when it first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={box} tabIndex={-1} className={`${CARD} py-2`} data-testid="document-read">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <p className="flex min-h-11 items-center gap-2 font-semibold">
          <Icon name="check" className="size-5 text-good" />
          The record&rsquo;s details are here
        </p>
        {onChange ? (
          <button type="button" onClick={onChange} className={LINK_BUTTON}>
            Change
          </button>
        ) : null}
      </div>
      {words.length > 0 ? (
        <details>
          <summary className="cursor-pointer py-2.5 font-semibold text-brand">
            Read what this record says
          </summary>
          <dl className="pb-2">
            {words.map(({ name, text }) => (
              <div key={name} className="mt-2 first:mt-0">
                <dt className="text-sm text-muted">{name}</dt>
                <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{text}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
