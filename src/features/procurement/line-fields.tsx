"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { describedBy, Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import type { OrderLine } from "@/data/types";
import { formatRand, parseQuantity, parseRand } from "./money";

/** One line of a work order or an invoice while it is being typed: everything is text. */
export interface LineDraft {
  sku: string;
  description: string;
  quantity: string;
  unitPrice: string;
}
export type LineField = keyof LineDraft;
export type LineErrors = Partial<Record<LineField, string>>;

export const emptyLine = (): LineDraft => ({
  sku: "",
  description: "",
  quantity: "",
  unitPrice: "",
});

/** Rand as a person types it, from cents: `685.00`. */
export function randInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface LineErrorWords {
  code: string;
  duplicateCode: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

/**
 * Check typed lines. Returns the lines as whole numbers and cents when every
 * field is good, and one set of errors per line otherwise. Nothing is
 * rounded or corrected: a field that does not read is an error.
 */
export function readLines(
  lines: LineDraft[],
  words: LineErrorWords,
): { errors: LineErrors[]; lines: OrderLine[] | null } {
  const codes = lines.map((line) => line.sku.trim().toUpperCase());
  const errors: LineErrors[] = [];
  const read: OrderLine[] = [];
  lines.forEach((line, index) => {
    const found: LineErrors = {};
    const sku = line.sku.trim();
    const description = line.description.trim();
    const quantity = parseQuantity(line.quantity, 1);
    const unitPriceCents = parseRand(line.unitPrice);
    if (!sku) found.sku = words.code;
    else if (codes.indexOf(sku.toUpperCase()) !== index) found.sku = words.duplicateCode;
    if (!description) found.description = words.description;
    if (quantity === null) found.quantity = words.quantity;
    if (unitPriceCents === null) found.unitPrice = words.unitPrice;
    errors.push(found);
    if (quantity !== null && unitPriceCents !== null && sku && description) {
      read.push({ sku, description, quantity, unitPriceCents });
    }
  });
  const clean = errors.every((found) => Object.keys(found).length === 0);
  return { errors, lines: clean ? read : null };
}

/** The total of the lines typed so far; null while any quantity or price does not read. */
export function draftTotal(lines: LineDraft[]): number | null {
  let total = 0;
  for (const line of lines) {
    const quantity = parseQuantity(line.quantity, 1);
    const price = parseRand(line.unitPrice);
    if (quantity === null || price === null) return null;
    total += quantity * price;
  }
  return total;
}

/**
 * The fields of each line: code, description, quantity and unit price, one
 * line per block so it reads as label and value on a phone. Every input has
 * its own label. A field marked `missing` was not found in pasted text: it is
 * left empty and highlighted for the person to fill in.
 */
export function LineFields({
  idPrefix,
  lines,
  onChange,
  errors,
  words,
  missing,
  missingHint,
}: {
  idPrefix: string;
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  errors: LineErrors[];
  words: {
    line: (n: number) => string;
    code: string;
    description: string;
    quantity: string;
    unitPrice: string;
    addLine: string;
    removeLine: (n: number) => string;
  };
  /** True for a field that could not be read from the pasted text. */
  missing?: (index: number, field: LineField) => boolean;
  missingHint?: string;
}) {
  const set = (index: number, field: LineField, value: string) =>
    onChange(
      lines.map((line, at) => (at === index ? { ...line, [field]: value } : line)),
    );

  function field(
    index: number,
    name: LineField,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
  ) {
    const id = `${idPrefix}-line-${index}-${name}`;
    const error = errors[index]?.[name];
    const notFound = !error && lines[index][name] === "" && missing?.(index, name);
    return (
      <Field
        id={id}
        label={label}
        error={error}
        hint={
          notFound ? (
            <span className="font-semibold text-accent">{missingHint}</span>
          ) : undefined
        }
      >
        <Input
          id={id}
          value={lines[index][name]}
          onChange={(event) => set(index, name, event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, {
            hint: Boolean(notFound),
            error: Boolean(error),
          })}
          data-missing={notFound || undefined}
          className={cn(notFound && "border-accent bg-accent-soft")}
          autoComplete="off"
          {...props}
        />
      </Field>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, index) => {
        const quantity = parseQuantity(line.quantity, 1);
        const price = parseRand(line.unitPrice);
        return (
          <fieldset
            key={index}
            data-testid="line"
            className="relative rounded-2xl border border-line bg-surface p-4 pt-2"
          >
            <legend className="px-1 text-sm font-semibold text-muted">
              {words.line(index + 1)}
            </legend>
            {lines.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange(lines.filter((_, at) => at !== index))}
                aria-label={words.removeLine(index + 1)}
                title={words.removeLine(index + 1)}
                className="absolute -top-1 right-1 inline-flex size-11 items-center justify-center rounded-full bg-surface text-muted hover:bg-sunken hover:text-ink"
              >
                <Icon name="x" className="size-5" />
              </button>
            ) : null}
            <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              {field(index, "sku", words.code, { autoCapitalize: "characters" })}
              {field(index, "description", words.description)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {field(index, "quantity", words.quantity, { inputMode: "numeric" })}
              {field(index, "unitPrice", words.unitPrice, { inputMode: "decimal" })}
            </div>
            {quantity !== null && price !== null ? (
              <p className="mt-2 text-right text-sm text-muted tabular-nums">
                {formatRand(quantity * price)}
              </p>
            ) : null}
          </fieldset>
        );
      })}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange([...lines, emptyLine()])}
        className="self-start"
      >
        <Icon name="plus" className="size-4" />
        {words.addLine}
      </Button>
    </div>
  );
}
