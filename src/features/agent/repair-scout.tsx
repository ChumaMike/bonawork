"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/field";
import { formatRand } from "@/shared/price-check";
import { AgentRequestError, postJson } from "./client";
import {
  MATERIALS_SHARE_PERCENT,
  computeBudget,
  type Budget,
  type ScoutLine,
  type ScoutResult,
} from "./contracts";
import { SpeakToReport } from "./voice";

export interface ConfirmedBudget {
  reportText: string;
  lines: ScoutLine[];
  budget: Budget;
}

const PRICE_LABEL: Record<ScoutLine["priceSource"], string> = {
  shops: "Shop price",
  reference_rate: "Reference rate",
  none: "No price yet",
  person: "Your price",
};

/** Rand text to cents; null when it is not a price. */
function toCents(value: string): number | null {
  const clean = value.replace(/[R\s ]/gi, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

const centsText = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2));

/**
 * Repair Scout for the school: describe the problem (typed or spoken), get a
 * draft parts list with shop prices and links, fix anything, and confirm.
 * The budget and the 40/60 split are worked out by code as you edit.
 * `onConfirm` receives the confirmed lines; this component creates nothing.
 */
export function RepairScout({
  initialReport = "",
  demo = false,
  onConfirm,
}: {
  initialReport?: string;
  /** Use the recorded sample prices when live shop prices are not set up. Shown as "Sample prices". */
  demo?: boolean;
  onConfirm?: (confirmed: ConfirmedBudget) => void;
}) {
  const id = useId();
  const [report, setReport] = useState(initialReport);
  const [result, setResult] = useState<ScoutResult | null>(null);
  const [lines, setLines] = useState<ScoutLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const budget = computeBudget(lines);

  async function draft() {
    setBusy(true);
    setError(null);
    setConfirmed(false);
    try {
      const data = await postJson<ScoutResult>("/api/agent/scout", { reportText: report, demo });
      setResult(data);
      setLines(data.lines);
    } catch (e) {
      setError(e instanceof AgentRequestError ? e.message : "Could not draft a budget. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function update(lineId: string, patch: Partial<ScoutLine>) {
    setConfirmed(false);
    setLines((all) => all.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)));
  }

  function confirm() {
    setConfirmed(true);
    onConfirm?.({ reportText: report, lines, budget });
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Repair Scout</h2>
        <p className="text-sm text-muted">
          Describe the problem. We suggest parts and look up shop prices. You check every line.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-report`} className="font-medium">
          What is broken?
        </label>
        <Textarea
          id={`${id}-report`}
          value={report}
          rows={4}
          maxLength={2000}
          onChange={(e) => setReport(e.target.value)}
          placeholder="Two toilets in the girls' block do not flush and one cistern is cracked."
        />
        <SpeakToReport onText={(text) => setReport((r) => (r ? `${r} ${text}` : text))} />
      </div>

      <div>
        <Button onClick={draft} loading={busy} disabled={report.trim().length < 10}>
          Suggest parts and prices
        </Button>
      </div>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">
              {result.partsSource === "ai" ? "Parts suggested by Bona AI" : "Parts from our repair list"}
            </Badge>
            {result.prices.mode === "sample" ? (
              <Badge tone="accent">Sample prices (recorded demo)</Badge>
            ) : result.prices.mode === "off" ? (
              <Badge tone="accent">Shop prices not set up</Badge>
            ) : (
              <Badge tone="neutral">Live shop prices</Badge>
            )}
          </div>

          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <li key={line.lineId} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <label htmlFor={`${id}-${line.lineId}-desc`} className="sr-only">
                    Item
                  </label>
                  <Input
                    id={`${id}-${line.lineId}-desc`}
                    value={line.description}
                    maxLength={120}
                    onChange={(e) => update(line.lineId, { description: e.target.value })}
                    className="min-w-0 flex-1"
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-${line.lineId}-qty`} className="text-sm text-muted">
                      {line.kind === "service" ? "Hours" : "Quantity"}
                    </label>
                    <Input
                      id={`${id}-${line.lineId}-qty`}
                      inputMode="numeric"
                      value={String(line.quantity)}
                      onChange={(e) => {
                        const n = Number.parseInt(e.target.value, 10);
                        if (Number.isInteger(n) && n >= 1 && n <= 50) update(line.lineId, { quantity: n });
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${id}-${line.lineId}-price`} className="text-sm text-muted">
                      Price each (R, VAT incl.)
                    </label>
                    <Input
                      id={`${id}-${line.lineId}-price`}
                      inputMode="decimal"
                      defaultValue={centsText(line.unitPriceCents)}
                      onBlur={(e) => {
                        const cents = toCents(e.target.value);
                        update(line.lineId, {
                          unitPriceCents: cents,
                          priceSource: cents === null ? "none" : cents === line.unitPriceCents ? line.priceSource : "person",
                        });
                      }}
                    />
                  </div>
                  <p className="col-span-2 self-end text-sm text-muted sm:col-span-1">
                    {PRICE_LABEL[line.priceSource]}
                  </p>
                </div>
                <p className="mt-2 text-sm text-muted">{line.note}</p>
                {line.offers.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                    {line.offers.slice(0, 3).map((offer) => (
                      <li key={offer.url}>
                        <a href={offer.url} target="_blank" rel="noreferrer" className="text-brand-strong underline">
                          {offer.retailer}
                        </a>{" "}
                        {formatRand(offer.priceCents)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>

          <dl className="grid grid-cols-1 gap-2 rounded-xl bg-sunken p-4 sm:grid-cols-3">
            <div>
              <dt className="text-sm text-muted">Budget</dt>
              <dd className="text-lg font-semibold">{formatRand(budget.totalCents)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Stage 1: materials ({MATERIALS_SHARE_PERCENT}%)</dt>
              <dd className="text-lg font-semibold">{formatRand(budget.materialsCents)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Stage 2: on completion ({100 - MATERIALS_SHARE_PERCENT}%)</dt>
              <dd className="text-lg font-semibold">{formatRand(budget.completionCents)}</dd>
            </div>
          </dl>

          {budget.unpriced > 0 ? (
            <Alert tone="warning">
              {budget.unpriced === 1 ? "1 line has" : `${budget.unpriced} lines have`} no price. Add a
              price from a quote before you confirm.
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={confirm} disabled={budget.unpriced > 0 || budget.totalCents === 0}>
              Confirm this budget
            </Button>
            {confirmed ? (
              <p className="text-sm text-muted" role="status">
                Confirmed by you. Nothing is funded until a funder fills the escrow.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
