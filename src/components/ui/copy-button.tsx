"use client";

import { useState } from "react";
import { useMessages } from "@/i18n";
import { cn } from "./cn";
import { Icon } from "./icon";

/** Copies `value` to the clipboard and confirms it in words, not only by icon. */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  /** What is being copied, for screen readers, e.g. "reference number". */
  label: string;
  className?: string;
}) {
  const m = useMessages();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the value is visible on screen and can be selected.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${m.common.copy}: ${label}`}
      className={cn(
        "no-print inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-strong hover:bg-brand-soft",
        className,
      )}
    >
      <Icon name={copied ? "check" : "copy"} className="size-4" />
      <span aria-live="polite">{copied ? m.common.copied : m.common.copy}</span>
    </button>
  );
}
