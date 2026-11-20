"use client";

import { useState, type FormEvent } from "react";
import { FilePicker } from "@/components/file-picker";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/page";
import type { EvidenceUpload, RecordGoodsReceiptInput, TrailOrder } from "@/data/types";
import { useMessages, type Messages } from "@/i18n";
import { parseQuantity } from "./money";

/** "Delivery recorded. 3 of 3 locks, 2 of 2 closers." At most three lines, then a count. */
export function deliverySentence(
  order: TrailOrder,
  received: RecordGoodsReceiptInput["lines"],
  m: Messages,
): string {
  const f = m.procurement.receiptForm;
  const parts = order.lines.map((line) =>
    f.part(
      received.find((item) => item.sku === line.sku)?.quantity ?? 0,
      line.quantity,
      line.description,
    ),
  );
  return f.success(parts.slice(0, 3), Math.max(0, parts.length - 3));
}

/**
 * The receiving officer's checklist: each ordered line, how many were
 * ordered, and one number to type: how many arrived. The field starts empty
 * and is never filled in with the ordered quantity, so a count is always a
 * count. This form knows nothing about prices: it is given none and shows none.
 */
export function ReceiptForm({
  order,
  onSubmit,
}: {
  order: Pick<TrailOrder, "lines" | "description">;
  onSubmit: (input: RecordGoodsReceiptInput) => Promise<void>;
}) {
  const m = useMessages();
  const f = m.procurement.receiptForm;
  const [arrived, setArrived] = useState<string[]>(() => order.lines.map(() => ""));
  const [uploads, setUploads] = useState<EvidenceUpload[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const counts = arrived.map((value) => parseQuantity(value));
    if (counts.some((value) => value === null)) return setShowErrors(true);
    setShowErrors(false);
    setFailed(false);
    setBusy(true);
    try {
      await onSubmit({
        lines: order.lines.map((line, index) => ({
          sku: line.sku,
          description: line.description,
          quantity: counts[index] ?? 0,
        })),
        ...(uploads.length > 0
          ? { evidenceDigests: uploads.map((upload) => upload.digest) }
          : {}),
      });
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="receipt-form"
      aria-labelledby="receipt-form-title"
      className="flex flex-col gap-5"
    >
      <div>
        <h2 id="receipt-form-title" className="text-xl">
          {f.title}
        </h2>
        <p className="mt-1 text-muted">{f.intro}</p>
      </div>

      {/* Tailwind resets list-style, and Safari then drops the list role; say it explicitly. */}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul
        role="list"
        className="divide-y divide-line rounded-2xl border border-line bg-surface px-4 shadow-card"
      >
        {order.lines.map((line, index) => {
          const id = `receipt-line-${index}`;
          const error =
            showErrors && parseQuantity(arrived[index]) === null ? f.lineError : null;
          return (
            <li
              key={line.sku}
              data-testid="receipt-line"
              className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold">{line.description}</p>
                <p className="text-sm text-muted">
                  <span className="font-mono">{line.sku}</span> ·{" "}
                  <span id={`${id}-hint`}>
                    {m.procurement.order.ordered(line.quantity)}
                  </span>
                </p>
              </div>
              <Field
                id={id}
                label={f.arrived}
                error={error}
                className="[&>label]:text-sm"
              >
                <Input
                  id={id}
                  value={arrived[index]}
                  onChange={(event) =>
                    setArrived(
                      arrived.map((value, at) =>
                        at === index ? event.target.value : value,
                      ),
                    )
                  }
                  inputMode="numeric"
                  aria-label={`${f.arrived}: ${line.description}`}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={describedBy(id, {
                    hint: true,
                    error: Boolean(error),
                  })}
                  autoComplete="off"
                  className="text-right tabular-nums"
                />
              </Field>
            </li>
          );
        })}
      </ul>

      <section aria-label={f.photos} className="flex flex-col gap-2">
        <p className="font-semibold">
          {f.photos} <span className="font-normal text-muted">({m.common.optional})</span>
        </p>
        <FilePicker value={uploads} onChange={setUploads} label={f.photos} />
        <p className="text-sm text-muted">{f.photosHelp}</p>
      </section>

      {showErrors || failed ? (
        <Notice tone="danger" icon="alert">
          <p role="alert">{failed ? m.common.actionError : f.error}</p>
        </Notice>
      ) : null}

      <Button type="submit" size="lg" loading={busy} className="w-full">
        {f.submit}
      </Button>
    </form>
  );
}
