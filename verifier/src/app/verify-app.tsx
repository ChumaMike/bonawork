"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { readVerifyFragment } from "../lib/link";
import { readRecord, recordFromLink, type RecordRead } from "../lib/record";
import { Checker, type Arrived } from "./checker";
import { LINK_BUTTON, SECONDARY_BUTTON } from "./parts";
import { QrScanner, useCanScan } from "./qr-scanner";
import type { Trust } from "./result";

/*
 * The record to check arrives in the URL fragment (after "#"), which a browser
 * never sends to a server. This component reads it and chooses the screen:
 *
 *   a record in the fragment   the record is filled in; choose the file, read one answer
 *   nothing in the fragment    "scan the code on a BonaBlock record"
 *   "Paste a receipt instead"  the two-step paste screen
 */

function subscribeToFragment(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** What the address the site was opened with holds. */
type Opened = Arrived | { kind: "plain" } | { kind: "unreadable" };

function openedWith(fragment: string): Opened {
  const read = readVerifyFragment(fragment);
  if (read.kind === "none") return { kind: "plain" };
  let record: RecordRead = { kind: "unreadable" };
  if (read.kind === "link") record = recordFromLink(read.link);
  else if (read.kind === "json") record = readRecord(read.text);
  return record.kind === "record" || record.kind === "sample"
    ? record
    : { kind: "unreadable" };
}

export function VerifyApp({ trust }: { trust: Trust }) {
  // The server cannot see the fragment, so it renders a neutral placeholder (null).
  const fragment = useSyncExternalStore<string | null>(
    subscribeToFragment,
    () => window.location.hash,
    () => null,
  );
  const opened = useMemo(
    () => (fragment === null ? null : openedWith(fragment)),
    [fragment],
  );
  const [pasting, setPasting] = useState(false);
  /** True after the person came back to the opening screen, so it takes the focus. */
  const [returned, setReturned] = useState(false);

  const leaveRecord = useCallback(() => {
    setPasting(false);
    setReturned(true);
    // A new history entry without the fragment: Back returns to the record.
    window.history.pushState(null, "", window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    window.scrollTo({ top: 0 });
  }, []);

  if (opened === null) {
    return (
      <div className="min-h-72" aria-busy="true">
        <p className="sr-only">Opening Bona Chain Verify</p>
      </div>
    );
  }
  if (opened.kind === "record" || opened.kind === "sample") {
    return (
      <Checker key={fragment} trust={trust} arrived={opened} onLeave={leaveRecord} />
    );
  }
  if (pasting) {
    return (
      <Checker
        key="paste"
        trust={trust}
        onLeave={() => {
          setPasting(false);
          setReturned(true);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }
  return (
    <Landing
      trust={trust}
      unreadable={opened.kind === "unreadable"}
      takeFocus={returned}
      onPaste={() => {
        setPasting(true);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}

/** Opened with nothing: say where the square code is and what scanning it does. */
export function Landing({
  trust,
  unreadable,
  takeFocus,
  onPaste,
}: {
  trust: Trust;
  /** The address had a fragment, but not one this site understands. */
  unreadable: boolean;
  takeFocus: boolean;
  onPaste: () => void;
}) {
  const canScan = useCanScan();
  const [scanning, setScanning] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (takeFocus) title.current?.focus({ preventScroll: true });
    // Only when the screen first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A square code holds a link to this site with the record after the "#".
  // Putting that part into this page's own address opens the record, exactly
  // as following the link would. Older codes hold the receipt text itself.
  const onScan = useCallback((text: string) => {
    setScanning(false);
    const scanned = text.trim();
    const at = scanned.indexOf("#");
    window.location.hash = scanned.startsWith("{")
      ? encodeURIComponent(scanned)
      : at >= 0
        ? scanned.slice(at + 1)
        : scanned;
  }, []);
  const stopScanning = useCallback(() => setScanning(false), []);

  return (
    <section aria-labelledby={titleId}>
      {unreadable ? (
        <p
          role="status"
          data-testid="link-unreadable"
          className="mb-5 rounded-xl border border-accent bg-accent-soft px-4 py-3 font-medium text-accent"
        >
          That link or code could not be read. It may have been cut short. Scan the code
          again, or paste the receipt instead.
        </p>
      ) : null}

      <h1
        id={titleId}
        ref={title}
        tabIndex={-1}
        className="text-2xl font-bold tracking-tight focus:outline-none sm:text-3xl"
      >
        Scan the code on a Bona Chain record
      </h1>
      <p className="mt-3 text-muted">
        Every Bona Chain record shows a square code. Point your phone&rsquo;s camera at
        it, from another phone, a laptop or a printed receipt. This page then opens with
        the record filled in.
      </p>

      <div className="mt-6 flex flex-col items-center rounded-xl border-2 border-dashed border-brand bg-surface px-4 py-8 text-center">
        <SquareCodePicture />
        <p className="mt-4 font-semibold">Use your phone&rsquo;s own camera</p>
        <p className="mt-1 text-sm text-muted">
          There is nothing to install, and this site does not need your camera.
        </p>
      </div>

      {canScan ? (
        scanning ? (
          <QrScanner onText={onScan} onClose={stopScanning} />
        ) : (
          <button
            type="button"
            onClick={() => setScanning(true)}
            className={`${SECONDARY_BUTTON} mt-4 w-full`}
          >
            Scan with this page instead
          </button>
        )
      ) : null}

      <p className="mt-5 text-center">
        <button
          type="button"
          onClick={onPaste}
          data-testid="paste-instead"
          className={LINK_BUTTON}
        >
          Paste a receipt instead
        </button>
      </p>

      <p className="mt-5 text-center text-sm text-muted">
        This site does not ask Bona Chain anything. It reads the {trust.network} itself.
      </p>
    </section>
  );
}

/** A drawing of a square code inside a camera frame. Decoration only. */
function SquareCodePicture() {
  return (
    <svg
      viewBox="0 0 96 96"
      className="size-28 text-brand"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Camera frame corners */}
      <path d="M4 22V10a6 6 0 0 1 6-6h12M74 4h12a6 6 0 0 1 6 6v12M92 74v12a6 6 0 0 1-6 6H74M22 92H10a6 6 0 0 1-6-6V74" />
      {/* The three corner squares of a code, and a few modules */}
      <rect x="22" y="22" width="18" height="18" rx="2" />
      <rect x="56" y="22" width="18" height="18" rx="2" />
      <rect x="22" y="56" width="18" height="18" rx="2" />
      <path d="M58 58h4M70 58h4M58 70h4M66 66h0M72 72h2" />
    </svg>
  );
}
