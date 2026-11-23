"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useMessages } from "@/i18n";
import { cn } from "./cn";
import { Icon } from "./icon";

const sizes = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
} as const;

/**
 * Modal built on the native <dialog>: focus trapping, Escape to close, inert
 * background and a backdrop come free. On phones it rises from the bottom as a
 * sheet with a handle; on wider screens it sits in the middle. `variant="sheet"`
 * keeps the sheet shape everywhere (see BottomSheet).
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  variant = "auto",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One sentence under the title, announced with it. */
  description?: string;
  children: ReactNode;
  /** Actions, pinned to the bottom. */
  footer?: ReactNode;
  size?: keyof typeof sizes;
  variant?: "auto" | "sheet";
  className?: string;
}) {
  const m = useMessages();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // The page behind a modal must not scroll with it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // A tap on the backdrop closes the sheet. Clicks inside the panel land on
  // children, so only the dialog element itself counts. Keyboard users have
  // Escape and the close button; this is a pointer convenience only.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const onBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) onClose();
    };
    dialog.addEventListener("click", onBackdropClick);
    return () => dialog.removeEventListener("click", onBackdropClick);
  }, [open, onClose]);

  const sheet = variant === "sheet";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "m-0 mt-auto flex max-h-[92dvh] w-full max-w-none flex-col rounded-t-3xl border border-line bg-surface p-0 text-ink shadow-sheet",
        "pb-[env(safe-area-inset-bottom)]",
        !sheet && "sm:m-auto sm:rounded-3xl sm:shadow-raised",
        !sheet && sizes[size],
        sheet && "sm:mx-auto sm:max-w-xl",
        className,
      )}
    >
      {open ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <span
            aria-hidden="true"
            className={cn(
              "mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-line-strong",
              !sheet && "sm:hidden",
            )}
          />
          <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-3 sm:px-7 sm:pt-5">
            <div className="min-w-0">
              <h2 id={titleId} className="text-2xl">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-muted">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={m.common.close}
              className="-mt-1 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
            >
              <Icon name="x" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 flex-col gap-2 border-t border-line px-5 py-4 sm:flex-row-reverse sm:px-7">
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
