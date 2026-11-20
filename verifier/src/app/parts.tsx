"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { formatBytes } from "../lib/receipt-text";

/* Shared pieces of the verifier's screens: buttons, icons, the paste box and the file box. */

/** The one main button of a screen. */
export const PRIMARY_BUTTON =
  "inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-brand px-5 text-base font-semibold text-on-brand transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-45";

/** A quieter action: outline. */
export const SECONDARY_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-base font-semibold text-brand-strong hover:border-brand disabled:cursor-not-allowed disabled:opacity-60";

/** The quietest action: reads as a link. */
export const LINK_BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg text-base font-semibold text-brand underline underline-offset-4 hover:text-brand-strong";

export const CARD = "rounded-2xl border border-line bg-surface p-4 shadow-card";

/** Focus ring for a label that wraps a visually hidden input. */
const FOCUS_WITHIN =
  "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand";

export type IconName =
  | "check"
  | "cross"
  | "search"
  | "noEntry"
  | "broken"
  | "info"
  | "file"
  | "paste"
  | "camera"
  | "external"
  | "chevron";

const ICON_PATHS: Record<IconName, ReactNode> = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  cross: <path d="m6.5 6.5 11 11m0-11-11 11" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  noEntry: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </>
  ),
  broken: (
    <>
      <path d="M9.5 14.5 7.8 16.2a3 3 0 0 1-4.2-4.2l2.6-2.6a3 3 0 0 1 4.2 0" />
      <path d="m14.5 9.5 1.7-1.7a3 3 0 0 1 4.2 4.2l-2.6 2.6a3 3 0 0 1-4.2 0" />
      <path d="M3 3l3 3M21 21l-3-3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.5" />
    </>
  ),
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </>
  ),
  paste: (
    <>
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 5V3h6v2M9 11h6M9 15h4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  external: <path d="M14 5h5v5M19 5l-8 8M11 7H5v12h12v-6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
};

export function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/**
 * A big Paste button that reads the clipboard when tapped. Where the browser
 * does not allow that, a text box opens so the person can paste by hand. A
 * saved file can be uploaded instead. Whatever arrives goes to `onText`; the
 * caller decides whether it is the right thing and says so through `problem`.
 */
export function PasteBox({
  buttonLabel,
  primary = false,
  hint,
  emptyHint,
  fieldLabel,
  uploadLabel,
  problem,
  problemDetail,
  focusOnMount = false,
  onText,
}: {
  buttonLabel: string;
  /** True when this is the screen's main button. */
  primary?: boolean;
  /** Where to copy the text from. */
  hint: string;
  /** Said when the clipboard is empty. */
  emptyHint: string;
  /** Label of the text box. */
  fieldLabel: string;
  uploadLabel: string;
  problem: string | null;
  problemDetail?: string;
  /** True when this box replaced something the person just pressed, so focus is not lost. */
  focusOnMount?: boolean;
  onText: (text: string) => void;
}) {
  const [byHand, setByHand] = useState(false);
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const ids = { field: useId(), hint: useId() };

  useEffect(() => {
    if (focusOnMount) button.current?.focus({ preventScroll: true });
    // Only when the box first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Move to the text box when it opens, so the next thing typed or pasted lands in it.
  useEffect(() => {
    if (byHand) field.current?.focus();
  }, [byHand]);

  async function paste() {
    setNote(null);
    let copied: string;
    try {
      if (!navigator.clipboard?.readText) throw new Error("No clipboard access");
      copied = await navigator.clipboard.readText();
    } catch {
      setByHand(true);
      setNote(
        "This browser did not let the page read what you copied. Paste it into the box below instead.",
      );
      return;
    }
    if (!copied.trim()) {
      setNote(`Nothing has been copied yet. ${emptyHint}`);
      return;
    }
    onText(copied);
  }

  return (
    <div>
      <button
        ref={button}
        type="button"
        onClick={paste}
        className={primary ? PRIMARY_BUTTON : `${SECONDARY_BUTTON} w-full`}
      >
        <Icon name="paste" />
        {buttonLabel}
      </button>
      <p id={ids.hint} className="mt-2 text-sm text-muted">
        {hint}
      </p>

      <div className="mt-1 flex flex-wrap gap-x-5">
        {byHand ? null : (
          <button
            type="button"
            onClick={() => setByHand(true)}
            className={`${LINK_BUTTON} text-sm`}
          >
            Paste it by hand
          </button>
        )}
        <label className={`${LINK_BUTTON} text-sm ${FOCUS_WITHIN}`}>
          {uploadLabel}
          <input
            type="file"
            accept="application/json,text/plain,.json,.txt"
            className="sr-only"
            onChange={async (event) => {
              const chosen = event.target.files?.[0];
              event.target.value = "";
              if (chosen) onText(await chosen.text());
            }}
          />
        </label>
      </div>

      {byHand ? (
        <div className="mt-2">
          <label htmlFor={ids.field} className="block text-sm font-semibold">
            {fieldLabel}
          </label>
          <textarea
            ref={field}
            id={ids.field}
            aria-describedby={ids.hint}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setNote(null);
              onText(event.target.value);
            }}
            rows={5}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 font-mono text-base"
          />
        </div>
      ) : null}

      <div role="status" aria-live="polite">
        {note ? <p className="mt-2 text-sm font-medium text-accent">{note}</p> : null}
        {problem ? (
          <div className="mt-2 rounded-xl border border-danger bg-danger-soft px-3 py-2 text-sm text-danger">
            <p className="font-medium">{problem}</p>
            {problemDetail ? (
              <details className="mt-1">
                <summary className="cursor-pointer py-2.5">Technical details</summary>
                <p className="font-mono [overflow-wrap:anywhere]">{problemDetail}</p>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Chooses the photo or document to compare. The file is read on this device
 * only; nothing here uploads it.
 */
export function FileBox({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  }

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center ${FOCUS_WITHIN} ${
        dragging || !file
          ? "border-brand bg-brand-soft/40 hover:bg-brand-soft"
          : "border-line-strong bg-surface hover:border-brand"
      }`}
    >
      <input
        type="file"
        className="sr-only"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          // Cleared so that choosing the same file again still counts as a choice.
          event.target.value = "";
          if (chosen) onFile(chosen);
        }}
      />
      {file ? (
        <>
          <span className="max-w-full font-semibold [overflow-wrap:anywhere]">
            {file.name}
          </span>
          <span className="text-sm text-muted">
            {formatBytes(file.size)} · Tap to choose another file
          </span>
        </>
      ) : (
        <>
          <Icon name="camera" className="size-7 text-brand" />
          <span className="font-semibold">Choose your photo or document</span>
          <span className="text-sm text-muted">It never leaves your device</span>
        </>
      )}
    </label>
  );
}
