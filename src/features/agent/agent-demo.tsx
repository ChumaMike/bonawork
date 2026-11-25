"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/field";
import { PageShell } from "@/components/ui/page";
import { DEMO_REVIEW_REQUEST } from "./demo-data";
import { FundingMandate } from "./funding-mandate";
import { PollarFund } from "./pollar-fund";
import { RepairScout } from "./repair-scout";
import { ReviewerChecks } from "./reviewer-copilot";
import { WhereMoney } from "./where-money";

const SECTIONS = [
  { id: "school", label: "School" },
  { id: "reviewer", label: "Reviewer" },
  { id: "public", label: "Public" },
  { id: "funder", label: "Funder" },
] as const;

/**
 * Demo of each Bona Agent tool, one per role. Sample data is labelled. The
 * case pages will mount the same components with real cases.
 */
export function AgentDemo() {
  const id = useId();
  const [escrow, setEscrow] = useState("");
  const [amount, setAmount] = useState("6450.00");
  const amountCents = Math.round(Number(amount.replace(/[R\s ]/g, "")) * 100) || 0;

  return (
    <PageShell
      eyebrow="Demo"
      title="Bona Agent"
      intro="One assistant, different tools for each role. It suggests. People and the escrow program decide."
      size="compact"
      width="narrow"
    >
      <nav aria-label="Roles" className="mb-6 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="rounded-full border border-line px-4 py-2 text-sm">
            {s.label}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-10">
        <section id="school" className="flex flex-col gap-3 scroll-mt-24">
          <h2 className="text-2xl tracking-tight">School: report and budget</h2>
          <RepairScout
            demo
            initialReport="The girls' toilets in block B do not flush. One cistern is cracked and leaks onto the floor."
          />
        </section>

        <section id="reviewer" className="flex flex-col gap-3 scroll-mt-24">
          <h2 className="text-2xl tracking-tight">Reviewer: two checks (sample case)</h2>
          <ReviewerChecks
            caseRef="SAMPLE-BW-0001"
            caseOpenedAt="2026-11-01T00:00:00Z"
            milestone={DEMO_REVIEW_REQUEST.milestone}
            lines={DEMO_REVIEW_REQUEST.lines}
            priceFlags={DEMO_REVIEW_REQUEST.priceFlags}
          />
        </section>

        <section id="public" className="flex flex-col gap-3 scroll-mt-24">
          <h2 className="text-2xl tracking-tight">Public: where&apos;s the money?</h2>
          <WhereMoney escrow="sample" />
        </section>

        <section id="funder" className="flex flex-col gap-3 scroll-mt-24">
          <h2 className="text-2xl tracking-tight">Funder</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-escrow`} className="text-sm font-medium">
                Escrow address (devnet), created with your Pollar wallet as funder
              </label>
              <Input id={`${id}-escrow`} value={escrow} onChange={(e) => setEscrow(e.target.value.trim())} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-amount`} className="text-sm font-medium">
                Escrow amount (R, sandbox)
              </label>
              <Input id={`${id}-amount`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <PollarFund escrow={escrow || null} amountCents={amountCents} />
          <FundingMandate />
        </section>
      </div>
    </PageShell>
  );
}
