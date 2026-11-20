"use client";

import { useId } from "react";
import { cn } from "@/components/ui/cn";
import { useMessages } from "@/i18n";

/** A little burst of hearts when the buddy is held. */
export function PetHearts() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {[-14, 2, 16].map((dx, i) => (
        <svg
          key={dx}
          viewBox="0 0 24 24"
          className="bona-pet-heart absolute top-0 left-1/2 size-4 fill-danger"
          style={{ marginLeft: dx - 8, animationDelay: `${i * 120}ms` }}
        >
          <path d="M12 21s-7.5-4.6-9.6-9.4C.9 7.9 3.4 4 7.2 4c2 0 3.6 1.1 4.8 2.7C13.2 5.1 14.8 4 16.8 4c3.8 0 6.3 3.9 4.8 7.6C19.5 16.4 12 21 12 21z" />
        </svg>
      ))}
    </span>
  );
}

export type SignerStatus = "off" | "loading" | "on" | "error";

/**
 * The buddy's extras, kept out of the chat: the sign language preview and
 * whether the robot strolls. Shown when the robot is held, and behind
 * "More options" in the chat bubble for keyboard and screen reader users.
 */
export function BuddyOptions({
  signer,
  onToggleSigner,
  still,
  onStill,
}: {
  signer: SignerStatus;
  onToggleSigner: () => void;
  still: boolean;
  onStill: (still: boolean) => void;
}) {
  const m = useMessages();
  const b = m.buddy;
  const signLabelId = useId();
  const signHelpId = useId();
  const signerOn = signer === "on" || signer === "loading";
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p id={signLabelId} className="font-semibold">
            {b.extras.signLabel}
          </p>
          <p id={signHelpId} className="text-muted">
            {b.extras.signHelp}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={signerOn}
          aria-busy={signer === "loading" || undefined}
          aria-labelledby={signLabelId}
          aria-describedby={signHelpId}
          onClick={onToggleSigner}
          className={cn(
            "inline-flex h-10 w-16 shrink-0 items-center gap-1 rounded-full border-2 px-1 text-xs font-semibold transition-colors",
            signerOn
              ? "flex-row-reverse border-brand bg-brand text-on-brand"
              : "border-line-strong bg-sunken text-muted",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-7 shrink-0 rounded-full",
              signerOn ? "bg-on-brand" : "bg-line-strong",
            )}
          />
          <span className="flex-1 text-center">
            {signerOn ? b.extras.on : b.extras.off}
          </span>
        </button>
      </div>
      <p aria-live="polite">
        {signer === "loading" ? (
          <span className="text-muted">{b.extras.loading}</span>
        ) : null}
        {signer === "error" ? (
          <span className="font-semibold text-danger">{b.extras.loadError}</span>
        ) : null}
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={still}
          onChange={(event) => onStill(event.target.checked)}
          className="size-5 accent-[var(--color-brand)]"
        />
        <span>
          <span className="font-semibold">{b.pet.still}</span>{" "}
          <span className="text-muted">{b.pet.stillHelp}</span>
        </span>
      </label>
    </div>
  );
}
