import type { ComponentProps, ReactNode } from "react";
import { useMessages } from "@/i18n";
import { cn } from "./cn";
import { Icon } from "./icon";

/*
 * Form controls. Every control is at least 48 px tall, has a 2 px border so
 * it is visible in sunlight, and shows an inset error border when invalid.
 * Pair them with <Field>, which wires the label, hint and error for you.
 */
const control =
  "w-full rounded-2xl border-2 border-line-strong bg-surface px-4 text-base text-ink placeholder:text-faint focus:border-brand aria-invalid:border-danger disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "min-h-12", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(control, "min-h-12 resize-y py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

/** Native select with a drawn chevron, so it looks the same on every phone. */
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select
        className={cn(control, "min-h-12 appearance-none pr-11", className)}
        {...props}
      />
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted"
      />
    </span>
  );
}

/**
 * Label, optional hint, required mark and error for one control. Pass the
 * same `id` to the control. `describedBy(id, { hint, error })` builds the
 * `aria-describedby` value for the control; the error is announced on change.
 *
 *   <Field id="name" label="Your name" hint="As on your ID" required error={errors.name}>
 *     <Input id="name" required aria-invalid={!!errors.name} aria-describedby={describedBy("name", { hint: true, error: !!errors.name })} />
 *   </Field>
 */
export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  optional = false,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Shows a required mark after the label. Still set `required` on the control. */
  required?: boolean;
  /** Shows "(optional)" after the label. Prefer marking the few optional ones over the many required. */
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const m = useMessages();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="font-semibold">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
        {optional ? (
          <span className="font-normal text-muted"> ({m.common.optional})</span>
        ) : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children}
      <p
        id={`${id}-error`}
        role="alert"
        className={cn(
          "flex items-start gap-1.5 text-sm font-semibold text-danger",
          !error && "hidden",
        )}
      >
        {error ? (
          <>
            <Icon name="alert" className="mt-0.5 size-4" />
            {error}
          </>
        ) : null}
      </p>
    </div>
  );
}

/** The `aria-describedby` value that matches what <Field> renders. */
export function describedBy(
  id: string,
  { hint = false, error = false }: { hint?: boolean; error?: boolean },
): string | undefined {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

/** A single checkbox with its label, 44 px tall, with an optional line of help. */
export function Checkbox({
  id,
  label,
  hint,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  id: string;
  label: ReactNode;
  hint?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-3 size-5 shrink-0 accent-brand"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...props}
      />
      <label htmlFor={id} className="flex min-h-11 flex-col justify-center py-2">
        <span className="font-semibold">{label}</span>
        {hint ? (
          <span id={`${id}-hint`} className="text-sm text-muted">
            {hint}
          </span>
        ) : null}
      </label>
    </div>
  );
}
