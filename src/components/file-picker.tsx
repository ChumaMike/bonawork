"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { EvidenceUpload } from "@/data/types";
import { useMessages } from "@/i18n";
import { formatBytes, shortDigest } from "@/lib/format";
import { sha256Hex } from "@/shared/commitment";
import { cn } from "./ui/cn";
import { Icon } from "./ui/icon";

const MAX_FILES = 5;
// What the server accepts: JPEG, PNG, WebP and HEIC photos, and PDFs (src/server/evidence/validate.ts).
const ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf";

/** SHA-256 of a file's exact bytes, computed in the browser. */
export async function fingerprint(file: File): Promise<EvidenceUpload> {
  return { file, digest: await sha256Hex(new Uint8Array(await file.arrayBuffer())) };
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/** A small preview of a chosen photo. Decorative: the file name sits next to it. */
function Thumbnail({ file }: { file: File }) {
  const url = useMemo(
    () => (file.type.startsWith("image/") ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  if (!url) {
    return (
      <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted">
        <Icon name="file" className="size-6" />
      </span>
    );
  }
  // A local object URL for a file that never leaves the device; the image optimiser does not apply.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="size-14 shrink-0 rounded-lg object-cover" />;
}

/**
 * Choose evidence. Camera first: on a phone "Take a photo" opens the camera
 * straight away. Each file's fingerprint is computed on the device before
 * anything is sent, so the person can see it and keep it.
 *
 * One file input serves both buttons, so a browser test can address it directly.
 */
export function FilePicker({
  value,
  onChange,
  label,
}: {
  value: EvidenceUpload[];
  onChange: (uploads: EvidenceUpload[]) => void;
  label?: string;
}) {
  const m = useMessages();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [tooMany, setTooMany] = useState(false);
  const full = value.length >= MAX_FILES;

  function open(mode: "camera" | "files") {
    const element = input.current;
    if (!element) return;
    if (mode === "camera") {
      element.accept = "image/*";
      element.setAttribute("capture", "environment");
      element.multiple = false;
    } else {
      element.accept = ACCEPT;
      element.removeAttribute("capture");
      element.multiple = true;
    }
    element.click();
  }

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    const room = MAX_FILES - value.length;
    setTooMany(files.length > room);
    setBusy(true);
    try {
      const added = await Promise.all(Array.from(files).slice(0, room).map(fingerprint));
      onChange([...value, ...added]);
    } finally {
      setBusy(false);
    }
  }

  const choice =
    "inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        id={id}
        type="file"
        multiple
        accept={ACCEPT}
        aria-label={label ?? m.files.choose}
        tabIndex={-1}
        className="sr-only"
        disabled={full}
        onChange={(event) => {
          void add(event.target.files);
          event.target.value = "";
        }}
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => open("camera")}
          disabled={full || busy}
          className={cn(choice, "bg-brand text-on-brand hover:bg-brand-strong")}
        >
          <CameraIcon />
          {m.files.takePhoto}
        </button>
        <button
          type="button"
          onClick={() => open("files")}
          disabled={full || busy}
          className={cn(
            choice,
            "border border-line-strong bg-surface text-ink hover:border-ink",
          )}
        >
          <Icon name="upload" className="size-6 shrink-0 text-brand" />
          {m.files.fromPhone}
        </button>
      </div>
      <p className="text-sm text-muted">
        {m.files.hint} {m.files.privacy}
      </p>

      <p aria-live="polite" className="text-sm font-semibold">
        {busy
          ? m.files.computing
          : full
            ? m.files.full
            : value.length > 0
              ? m.files.selected(value.length)
              : ""}
      </p>
      {tooMany ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {m.files.tooMany}
        </p>
      ) : null}

      {value.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {value.map((upload, index) => (
            <li
              key={`${upload.digest}-${index}`}
              className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
            >
              <Thumbnail file={upload.file} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{upload.file.name}</p>
                <p className="text-sm text-muted">
                  {formatBytes(upload.file.size)} · {m.ledger.fingerprint}{" "}
                  <code className="font-mono">{shortDigest(upload.digest)}</code>
                </p>
                <p className="flex items-center gap-1 text-xs font-semibold text-brand-strong">
                  <Icon name="shieldCheck" className="size-3.5" />
                  {m.files.computedHere}
                </p>
              </div>
              <button
                type="button"
                aria-label={m.files.remove(upload.file.name)}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-sunken"
              >
                <Icon name="x" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
