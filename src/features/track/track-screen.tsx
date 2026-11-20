"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Container, PageHeader, SectionTitle } from "@/components/ui/page";
import { getApi } from "@/data/api";
import { useMessages } from "@/i18n";
import { REFERENCE_PATTERN, timeAgo } from "@/lib/format";
import { forgetReference, rememberReference, useRecentReferences } from "./recent";

export function TrackScreen() {
  const m = useMessages();
  const t = m.track;
  const router = useRouter();
  const recent = useRecentReferences();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function find(event: FormEvent) {
    event.preventDefault();
    const reference = value.trim().toUpperCase();
    if (!REFERENCE_PATTERN.test(reference)) return setError(t.invalid);
    setBusy(true);
    setError(null);
    try {
      const issue = await getApi().getIssue(reference);
      if (issue) {
        rememberReference({ reference, issueId: issue.id, title: issue.title });
        return router.push(`/issues/${issue.id}`);
      }
      setError(t.notFound);
    } catch {
      setError(m.common.actionError);
    }
    setBusy(false);
  }

  return (
    <Container size="narrow">
      <PageHeader title={t.title} intro={t.intro} />
      <form onSubmit={find} noValidate className="flex flex-col gap-4">
        <Field id="track-reference" label={t.label} error={error}>
          <Input
            id="track-reference"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t.placeholder}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            aria-invalid={Boolean(error)}
            className="min-h-14 font-mono text-xl tracking-wide"
          />
        </Field>
        <Button
          type="submit"
          disabled={busy}
          className="min-h-14 w-full sm:min-h-12 sm:w-auto sm:self-start"
        >
          <Icon name="search" />
          {busy ? m.common.loading : t.action}
        </Button>
      </form>

      <section aria-labelledby="recent-title" className="mt-10">
        <SectionTitle id="recent-title">{t.recentTitle}</SectionTitle>
        <p className="mt-1 text-sm text-muted">{t.recentHelp}</p>
        {recent.length === 0 ? (
          <EmptyState
            title={t.recentEmptyTitle}
            body={t.recentNone}
            photo="empty_state"
            className="mt-4"
          />
        ) : (
          <ul className="mt-4 flex flex-col gap-2" data-testid="recent-references">
            {recent.map((item) => (
              <li
                key={item.reference}
                className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 pl-4"
              >
                <Link
                  href={`/issues/${item.issueId}`}
                  className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-1"
                >
                  <span className="font-mono font-bold">{item.reference}</span>
                  <span className="truncate text-sm">{item.title}</span>
                  <span className="text-xs text-muted">
                    {t.seen(timeAgo(item.seenAt, m))}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => forgetReference(item.reference)}
                  aria-label={t.forget(item.reference)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
                >
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
