"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { HeroSearch, PageShell, SectionTitle } from "@/components/ui/page";
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
    <PageShell
      eyebrow={m.shell.eyebrow.track}
      title={t.title}
      intro={t.intro}
      hero={
        <>
          <HeroSearch id="track-reference" label={t.label} onSubmit={find}>
            <input
              id="track-reference"
              data-mono=""
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={t.placeholder}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "track-reference-error" : undefined}
            />
            <button
              type="submit"
              disabled={busy}
              className="vl-btn vl-btn-white vl-btn-sm"
            >
              <Icon name="search" className="size-4" />
              {busy ? m.common.loading : t.action}
            </button>
          </HeroSearch>
          {/* Always in the page, so a screen reader hears the message when it appears. */}
          <p id="track-reference-error" role="alert">
            {error ? (
              <span className="vl-pagehero-error">
                <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                {error}
              </span>
            ) : null}
          </p>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section aria-labelledby="recent-title" className="min-w-0">
          <SectionTitle id="recent-title">{t.recentTitle}</SectionTitle>
          <p className="mt-1 text-sm text-muted">{t.recentHelp}</p>
          {recent.length === 0 ? (
            <EmptyState
              title={t.recentEmptyTitle}
              body={t.recentNone}
              icon="list"
              className="mt-4"
            />
          ) : (
            <ul className="mt-4 flex flex-col gap-3" data-testid="recent-references">
              {recent.map((item) => (
                <li
                  key={item.reference}
                  className="flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 pl-5 shadow-card"
                >
                  <Link
                    href={`/issues/${item.issueId}`}
                    className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-1.5"
                  >
                    <span className="font-mono text-sm text-muted">{item.reference}</span>
                    <span className="truncate font-medium">{item.title}</span>
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

        <Card className="flex flex-col gap-4">
          <h2 className="text-xl">{t.howTitle}</h2>
          <ul className="flex flex-col gap-3 text-[0.95rem]">
            {t.how.map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <Icon name="check" className="mt-1 size-4 shrink-0 text-brand" />
                {line}
              </li>
            ))}
          </ul>
          <Link
            href="/schools"
            className="inline-flex min-h-11 items-center gap-1.5 self-start font-medium text-brand-strong underline-offset-4 hover:underline"
          >
            {m.landing.browseSchools}
            <Icon name="arrowRight" className="size-4" />
          </Link>
        </Card>
      </div>
    </PageShell>
  );
}
