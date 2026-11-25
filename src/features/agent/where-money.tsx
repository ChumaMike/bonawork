"use client";

import { useId, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { AgentRequestError, postJson } from "./client";
import type { MoneyAnswer } from "./contracts";
import { ReadAloud } from "./voice";

const QUICK = ["Where is the money now?", "Has the contractor received anything?", "What happens next?"];

/**
 * "Where's the money?" for a public case page. Answers come only from the
 * escrow's public state on Solana devnet; the facts are always listed under
 * the answer, with links to the explorer. Pass `escrow="sample"` for the
 * labelled demo case.
 */
export function WhereMoney({ escrow }: { escrow: string }) {
  const id = useId();
  const [question, setQuestion] = useState(QUICK[0]);
  const [answer, setAnswer] = useState<MoneyAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    setQuestion(q);
    setBusy(true);
    setError(null);
    try {
      setAnswer(await postJson<MoneyAnswer>("/api/agent/money", { escrow, question: q }));
    } catch (e) {
      setError(e instanceof AgentRequestError ? e.message : "Could not read the escrow. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Where&apos;s the money?</h2>
        <p className="text-sm text-muted">Answers come from the public record on Solana.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <Button key={q} variant="secondary" size="sm" onClick={() => ask(q)} disabled={busy}>
            {q}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim().length >= 2) void ask(question.trim());
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Your question
        </label>
        <Input id={`${id}-q`} value={question} maxLength={300} onChange={(e) => setQuestion(e.target.value)} />
        <Button type="submit" loading={busy}>
          Ask
        </Button>
      </form>

      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}

      {answer ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          {answer.sample ? (
            <Badge tone="accent" className="self-start">
              Sample case
            </Badge>
          ) : null}
          <p className="text-lg">{answer.answer}</p>
          <ReadAloud text={answer.answer} />
          <details className="rounded-xl bg-sunken p-3 text-sm">
            <summary className="cursor-pointer font-medium">The record</summary>
            <ul className="mt-2 list-disc pl-5">
              {answer.facts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            {answer.links.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {answer.links.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-brand-strong underline">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        </div>
      ) : null}
    </Card>
  );
}
