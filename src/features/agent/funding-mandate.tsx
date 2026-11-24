"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { AgentRequestError, postJson } from "./client";
import type { MandatePlan, MandateRules } from "./contracts";

const split = (text: string) =>
  text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const randToCents = (text: string) => Math.round(Number(text.replace(/[R\s ]/g, "")) * 100) || 0;

/**
 * Funding Mandate for a funder: set regions, categories and caps; get the
 * cases that fit, in an order with reasons, each checked against the caps.
 * The funder ticks the ones to approve; `onApprove` gets their IDs. Nothing
 * is funded from here.
 */
export function FundingMandate({ onApprove }: { onApprove?: (ids: string[]) => void }) {
  const id = useId();
  const [regions, setRegions] = useState("Gauteng");
  const [categories, setCategories] = useState("toilets, windows, water");
  const [perCase, setPerCase] = useState("10000");
  const [monthly, setMonthly] = useState("20000");
  const [plan, setPlan] = useState<MandatePlan | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setSent(false);
    const rules: MandateRules = {
      regions: split(regions),
      categories: split(categories),
      perCaseCapCents: randToCents(perCase),
      monthlyCapCents: randToCents(monthly),
    };
    try {
      const data = await postJson<MandatePlan>("/api/agent/mandate", { rules });
      setPlan(data);
      setPicked(new Set());
    } catch (e) {
      setError(e instanceof AgentRequestError ? e.message : "Could not build the list.");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: string, label: string, value: string, set: (v: string) => void, numeric = false) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={`${id}-${key}`}
        value={value}
        inputMode={numeric ? "decimal" : undefined}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Funding rules</h2>
        <p className="text-sm text-muted">Set your rules. You approve every case yourself.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("regions", "Regions (comma separated)", regions, setRegions)}
        {field("categories", "Categories (comma separated)", categories, setCategories)}
        {field("per", "Most per case (R)", perCase, setPerCase, true)}
        {field("month", "Most per month (R)", monthly, setMonthly, true)}
      </div>
      <Button onClick={run} loading={busy} className="self-start">
        Show cases that fit
      </Button>
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      {plan ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {plan.sample ? <Badge tone="accent">Sample cases</Badge> : null}
            <Badge tone="neutral">{plan.source === "ai" ? "Order suggested by Bona AI" : "Oldest first"}</Badge>
          </div>
          {plan.ranked.length === 0 ? <p className="text-sm text-muted">No open case fits these rules.</p> : null}
          <ul className="flex flex-col gap-2">
            {plan.ranked.map((r) => (
              <li key={r.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start gap-3">
                  <input
                    id={`${id}-${r.id}`}
                    type="checkbox"
                    className="mt-1 size-5"
                    disabled={!r.fitsCaps}
                    checked={picked.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(picked);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      setPicked(next);
                      setSent(false);
                    }}
                  />
                  <label htmlFor={`${id}-${r.id}`}>
                    <span className="font-medium">{r.id}</span>
                    <span className="block text-sm">{r.reason}</span>
                    <span className={r.fitsCaps ? "block text-sm text-muted" : "block text-sm text-danger"}>
                      {r.capNote}
                    </span>
                  </label>
                </div>
              </li>
            ))}
          </ul>
          {plan.excluded.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer">Not shown ({plan.excluded.length})</summary>
              <ul className="mt-1 list-disc pl-5">
                {plan.excluded.map((e) => (
                  <li key={e.id}>
                    {e.id}: {e.why}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <Button
            className="self-start"
            disabled={picked.size === 0}
            onClick={() => {
              setSent(true);
              onApprove?.([...picked]);
            }}
          >
            Approve {picked.size === 1 ? "1 case" : `${picked.size} cases`}
          </Button>
          {sent ? (
            <p className="text-sm text-muted" role="status">
              Approved by you. Each case is funded only when you send the money to its escrow.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
