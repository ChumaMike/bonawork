"use client";

import { useState, type FormEvent } from "react";
import { focusHere } from "@/components/staff/flow";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { describedBy, Field, Input, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/page";
import { ApiError, getApi, type BonaApi } from "@/data/api";
import type {
  InvoiceDraft,
  MoneyTrail,
  SubmitInvoiceInput,
  TrailOrder,
} from "@/data/types";
import { useMessages } from "@/i18n";
import {
  emptyLine,
  LineFields,
  randInput,
  readLines,
  type LineDraft,
  type LineErrors,
  type LineField,
} from "./line-fields";
import { formatRand, linesTotal, parseQuantity, parseRand } from "./money";

/**
 * Invoice text for this order, as a supplier might paste it. The plain one
 * agrees with the order. The other charges for one more of the first line at
 * a higher price, so the demo can show the rules blocking it.
 */
export function sampleInvoiceText(order: TrailOrder, mistake: boolean): string {
  const lines = order.lines.map((line, index) => ({
    ...line,
    quantity: mistake && index === 0 ? line.quantity + 1 : line.quantity,
    unitPriceCents: (line.unitPriceCents ?? 0) + (mistake && index === 0 ? 5_000 : 0),
  }));
  return [
    order.supplierName,
    `Invoice number: ${mistake ? "INV-2041" : "INV-2042"}`,
    `Order version: ${order.version}`,
    ...lines.map(
      (line) =>
        `${line.quantity} x [${line.sku}] ${line.description} @ ${formatRand(line.unitPriceCents)}`,
    ),
    `Total: ${formatRand(linesTotal(lines))}`,
  ].join("\n");
}

/**
 * The demo shortcut: Bona AI reads the corrected sample invoice and, when it
 * read every field, the invoice is sent as read. Returns null when anything
 * could not be read, so the caller opens the normal form instead: a field is
 * never guessed. The rules still check the invoice against the order and the
 * delivery; this only skips the supplier's own look at the fields.
 */
export async function sendCorrectedSample(
  api: Pick<BonaApi, "draftInvoice" | "submitInvoice">,
  issueId: string,
  order: TrailOrder,
  onRead?: () => void,
): Promise<MoneyTrail | null> {
  const text = sampleInvoiceText(order, false);
  const draft = await api.draftInvoice(issueId, text);
  const lines = draft.lines.flatMap((line) =>
    line.sku && line.description && line.quantity !== null && line.unitPriceCents !== null
      ? [
          {
            sku: line.sku,
            description: line.description,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
          },
        ]
      : [],
  );
  if (
    !draft.invoiceNumber ||
    draft.orderVersion === null ||
    draft.totalCents === null ||
    lines.length === 0 ||
    lines.length !== draft.lines.length
  ) {
    return null;
  }
  onRead?.();
  return api.submitInvoice(issueId, {
    invoiceNumber: draft.invoiceNumber,
    orderVersion: draft.orderVersion,
    lines,
    totalCents: draft.totalCents,
    aiDrafted: true,
    sourceText: text,
  });
}

type FieldErrors = {
  invoiceNumber?: string;
  orderVersion?: string;
  total?: string;
  lines: LineErrors[];
  form?: string;
};

/** The entries of `InvoiceDraft.missing` that name a field. */
const FIELD_NAME =
  /^(invoiceNumber|orderVersion|totalCents|lines|lines\[\d+\]\.(sku|description|quantity|unitPriceCents))$/;

const LINE_KEYS: Record<LineField, string> = {
  sku: "sku",
  description: "description",
  quantity: "quantity",
  unitPrice: "unitPriceCents",
};

/**
 * The supplier's invoice in three numbered steps on one page: paste the
 * text, check the fields, submit. Bona AI only reads the text into the
 * fields. A field it could not read stays empty and is marked; the supplier
 * checks every field and is the one who submits.
 */
export function InvoiceForm({
  trail,
  onSubmitted,
}: {
  /** The order being invoiced, as the supplier sees it. */
  trail: MoneyTrail;
  /** Called with the trail the backend returned, which holds the match result. */
  onSubmitted: (trail: MoneyTrail) => void;
}) {
  const m = useMessages();
  const f = m.procurement.invoiceForm;
  const [text, setText] = useState("");
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());
  // What Bona AI flagged besides unread fields, e.g. a total that is not the sum of the lines.
  const [flags, setFlags] = useState<string[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [orderVersion, setOrderVersion] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [total, setTotal] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({ lines: [] });
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const priced = trail.order.totalCents !== undefined;

  function fill(draft: InvoiceDraft) {
    setInvoiceNumber(draft.invoiceNumber ?? "");
    setOrderVersion(draft.orderVersion === null ? "" : String(draft.orderVersion));
    setLines(
      draft.lines.length > 0
        ? draft.lines.map((line) => ({
            sku: line.sku ?? "",
            description: line.description ?? "",
            quantity: line.quantity === null ? "" : String(line.quantity),
            unitPrice: line.unitPriceCents === null ? "" : randInput(line.unitPriceCents),
          }))
        : [emptyLine()],
    );
    setTotal(draft.totalCents === null ? "" : randInput(draft.totalCents));
    // With no line read at all, every field of the first line is missing.
    const all = new Set(draft.missing);
    if (draft.lines.length === 0) {
      for (const key of Object.values(LINE_KEYS)) all.add(`lines[0].${key}`);
    }
    setMissing(all);
    // `missing` names fields; anything else in it is a sentence for the supplier to read.
    setFlags(draft.missing.filter((entry) => !FIELD_NAME.test(entry)));
    setErrors({ lines: [] });
  }

  async function read() {
    if (!text.trim()) return setReadError(f.pasteFirst);
    setReading(true);
    setReadError(null);
    try {
      fill(await getApi().draftInvoice(trail.issueId, text));
      setAiDrafted(true);
      setFieldsOpen(true);
    } catch {
      setReadError(f.readFailed);
    } finally {
      setReading(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const read = readLines(lines, f.errors);
    const version = parseQuantity(orderVersion, 1);
    const totalCents = parseRand(total);
    const found: FieldErrors = {
      invoiceNumber: invoiceNumber.trim() ? undefined : f.errors.invoiceNumber,
      orderVersion: version === null ? f.errors.orderVersion : undefined,
      total: totalCents === null ? f.errors.total : undefined,
      lines: read.errors,
    };
    if (found.invoiceNumber || version === null || totalCents === null || !read.lines) {
      return setErrors({ ...found, form: f.errors.fix });
    }
    setErrors({ lines: [] });
    setBusy(true);
    const input: SubmitInvoiceInput = {
      invoiceNumber: invoiceNumber.trim(),
      orderVersion: version,
      lines: read.lines,
      totalCents,
      aiDrafted,
      ...(aiDrafted && text.trim() ? { sourceText: text } : {}),
    };
    try {
      onSubmitted(await getApi().submitInvoice(trail.issueId, input));
    } catch (cause) {
      const refused = cause instanceof ApiError && cause.code === "invalid_input";
      setErrors({ lines: [], form: refused ? f.errors.fix : m.common.actionError });
    } finally {
      setBusy(false);
    }
  }

  /** A top-level field Bona AI could not read, still empty. */
  const notFound = (name: string, value: string) => value === "" && missing.has(name);
  const hintFor = (name: string, value: string, hint?: string) =>
    notFound(name, value) ? (
      <span className="font-medium text-accent">{f.notFound}</span>
    ) : (
      hint
    );
  const missingClass = (name: string, value: string) =>
    cn(notFound(name, value) && "border-accent");

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="invoice-form"
      aria-label={f.flow}
      className="flex flex-col gap-6"
    >
      <section aria-labelledby="invoice-paste-title" className="flex flex-col gap-3">
        <h2 id="invoice-paste-title" className="text-xl">
          {f.pasteTitle}
        </h2>
        <Field
          id="invoice-text"
          label={f.pasteLabel}
          hint={f.pasteHint}
          error={readError}
        >
          <Textarea
            id="invoice-text"
            rows={7}
            maxLength={f.pasteLimit}
            value={text}
            onChange={(event) => setText(event.target.value)}
            aria-describedby={describedBy("invoice-text", {
              hint: true,
              error: Boolean(readError),
            })}
            spellCheck={false}
            className="font-mono text-sm"
          />
        </Field>
        {priced ? (
          <div className="flex flex-col gap-1 rounded-2xl bg-sunken px-4 py-2">
            <p className="text-sm">{f.sampleNote}</p>
            <div className="-mx-2 flex flex-wrap gap-x-1">
              {[false, true].map((mistake) => (
                <button
                  key={String(mistake)}
                  type="button"
                  onClick={() => {
                    setText(sampleInvoiceText(trail.order, mistake));
                    setReadError(null);
                  }}
                  className="inline-flex min-h-11 items-center rounded-lg px-2 text-left text-sm font-semibold text-brand-strong underline underline-offset-4"
                >
                  {mistake ? f.sampleWrong : f.sample}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="flex flex-col items-start gap-1">
          <Button
            variant="secondary"
            loading={reading}
            onClick={() => void read()}
            className="w-full sm:w-auto"
          >
            {reading ? null : <Icon name="sparkle" />}
            {f.read}
          </Button>
          {fieldsOpen ? null : (
            <button
              type="button"
              onClick={() => setFieldsOpen(true)}
              className="inline-flex min-h-11 items-center font-semibold text-brand-strong underline underline-offset-4"
            >
              {f.typeMyself}
            </button>
          )}
        </div>
      </section>

      {fieldsOpen ? (
        <>
          <section
            aria-labelledby="invoice-check-title"
            data-testid="invoice-fields"
            className="flex flex-col gap-4"
          >
            <h2
              id="invoice-check-title"
              ref={focusHere}
              tabIndex={-1}
              className="text-xl"
            >
              {f.checkTitle}
            </h2>
            {aiDrafted ? (
              <Notice icon="sparkle" tone="warning">
                <p data-testid="ai-banner">{f.aiBanner}</p>
              </Notice>
            ) : null}
            {aiDrafted && flags.length > 0 ? (
              <Notice icon="alert" tone="warning" title={f.flagsTitle}>
                <ul data-testid="ai-flags" className="list-disc pl-5">
                  {flags.map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="invoice-number"
                label={f.invoiceNumber}
                error={errors.invoiceNumber}
                hint={hintFor("invoiceNumber", invoiceNumber)}
              >
                <Input
                  id="invoice-number"
                  value={invoiceNumber}
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                  aria-invalid={errors.invoiceNumber ? true : undefined}
                  aria-describedby={describedBy("invoice-number", {
                    hint: notFound("invoiceNumber", invoiceNumber),
                    error: Boolean(errors.invoiceNumber),
                  })}
                  data-missing={notFound("invoiceNumber", invoiceNumber) || undefined}
                  className={missingClass("invoiceNumber", invoiceNumber)}
                  autoComplete="off"
                />
              </Field>
              <Field
                id="invoice-version"
                label={f.orderVersion}
                error={errors.orderVersion}
                hint={hintFor(
                  "orderVersion",
                  orderVersion,
                  f.orderVersionHint(trail.order.version),
                )}
              >
                <Input
                  id="invoice-version"
                  value={orderVersion}
                  onChange={(event) => setOrderVersion(event.target.value)}
                  inputMode="numeric"
                  aria-invalid={errors.orderVersion ? true : undefined}
                  aria-describedby={describedBy("invoice-version", {
                    hint: true,
                    error: Boolean(errors.orderVersion),
                  })}
                  data-missing={notFound("orderVersion", orderVersion) || undefined}
                  className={missingClass("orderVersion", orderVersion)}
                  autoComplete="off"
                />
              </Field>
            </div>

            <LineFields
              idPrefix="invoice"
              lines={lines}
              onChange={setLines}
              errors={errors.lines}
              words={f}
              missing={(index, field) =>
                missing.has("lines") || missing.has(`lines[${index}].${LINE_KEYS[field]}`)
              }
              missingHint={f.notFound}
            />

            <Field
              id="invoice-total"
              label={f.total}
              error={errors.total}
              hint={hintFor("totalCents", total, f.totalHint)}
            >
              <Input
                id="invoice-total"
                value={total}
                onChange={(event) => setTotal(event.target.value)}
                inputMode="decimal"
                aria-invalid={errors.total ? true : undefined}
                aria-describedby={describedBy("invoice-total", {
                  hint: true,
                  error: Boolean(errors.total),
                })}
                data-missing={notFound("totalCents", total) || undefined}
                className={missingClass("totalCents", total)}
                autoComplete="off"
              />
            </Field>
          </section>

          <section aria-labelledby="invoice-submit-title" className="flex flex-col gap-3">
            <h2 id="invoice-submit-title" className="text-xl">
              {f.submitTitle}
            </h2>
            <p className="text-muted">{f.submitNote}</p>
            {errors.form ? (
              <Notice tone="danger" icon="alert">
                <p role="alert">{errors.form}</p>
              </Notice>
            ) : null}
            <Button type="submit" size="lg" loading={busy} className="w-full">
              {f.submit}
            </Button>
          </section>
        </>
      ) : null}
    </form>
  );
}
