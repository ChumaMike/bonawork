"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/page";
import { ApiError } from "@/data/api";
import type { ApproveWorkOrderInput } from "@/data/types";
import { useMessages } from "@/i18n";
import {
  draftTotal,
  emptyLine,
  LineFields,
  readLines,
  type LineDraft,
  type LineErrors,
} from "./line-fields";
import { formatRand } from "./money";

/**
 * The buyer's work order: who does the work, what must be done, and the
 * lines with a quantity and a unit price. The total is computed from the
 * lines and never typed. One main action: approve.
 */
export function OrderForm({
  onSubmit,
}: {
  /** Rejects with an `ApiError` when the order is refused. */
  onSubmit: (input: ApproveWorkOrderInput) => Promise<void>;
}) {
  const m = useMessages();
  const f = m.procurement.orderForm;
  const [supplierRef, setSupplierRef] = useState("");
  const [scope, setScope] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [errors, setErrors] = useState<{
    supplierRef?: string;
    scope?: string;
    lines: LineErrors[];
    form?: string;
  }>({ lines: [] });
  const [busy, setBusy] = useState(false);
  const total = draftTotal(lines);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const read = readLines(lines, f.errors);
    const found = {
      supplierRef: supplierRef.trim() ? undefined : f.errors.supplierRef,
      scope: scope.trim() ? undefined : f.errors.scope,
      lines: read.errors,
    };
    if (found.supplierRef || found.scope || !read.lines) {
      return setErrors({ ...found, form: f.errors.fix });
    }
    setErrors({ lines: [] });
    setBusy(true);
    try {
      await onSubmit({
        supplierRef: supplierRef.trim(),
        description: scope.trim(),
        lines: read.lines,
      });
    } catch (cause) {
      const unknown = cause instanceof ApiError && cause.code === "invalid_input";
      setErrors(
        unknown
          ? { lines: [], supplierRef: f.unknownSupplier, form: f.unknownSupplier }
          : { lines: [], form: m.common.actionError },
      );
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="order-form"
      aria-labelledby="order-form-title"
      className="flex flex-col gap-5"
    >
      <h2 id="order-form-title" className="text-xl">
        {f.title}
      </h2>

      <Field
        id="order-supplier"
        label={f.supplierRef}
        hint={f.supplierRefHint}
        error={errors.supplierRef}
      >
        <Input
          id="order-supplier"
          value={supplierRef}
          onChange={(event) => setSupplierRef(event.target.value)}
          aria-invalid={errors.supplierRef ? true : undefined}
          aria-describedby={describedBy("order-supplier", {
            hint: true,
            error: Boolean(errors.supplierRef),
          })}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      <Field id="order-scope" label={f.scope} hint={f.scopeHint} error={errors.scope}>
        <Textarea
          id="order-scope"
          rows={3}
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          aria-invalid={errors.scope ? true : undefined}
          aria-describedby={describedBy("order-scope", {
            hint: true,
            error: Boolean(errors.scope),
          })}
        />
      </Field>

      <section aria-labelledby="order-lines-title" className="flex flex-col gap-2">
        <h3 id="order-lines-title" className="font-semibold">
          {f.linesTitle}
        </h3>
        <LineFields
          idPrefix="order"
          lines={lines}
          onChange={setLines}
          errors={errors.lines}
          words={f}
        />
      </section>

      <p className="flex items-baseline justify-between gap-3 rounded-2xl bg-sunken px-4 py-3">
        <span className="font-semibold">{f.total}</span>
        <span
          data-testid="order-form-total"
          aria-live="polite"
          className="text-xl font-bold tabular-nums"
        >
          {total === null ? "—" : formatRand(total)}
        </span>
      </p>

      {errors.form ? (
        <Notice tone="danger" icon="alert">
          <p role="alert">{errors.form}</p>
        </Notice>
      ) : null}

      <Button type="submit" size="lg" loading={busy} className="w-full">
        {f.submit}
      </Button>
    </form>
  );
}
