"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  EmptyState,
  HeroSearch,
  LoadError,
  Loading,
  PageShell,
} from "@/components/ui/page";
import { getApi } from "@/data/api";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";
import { SchoolCard } from "./school-bits";

export function SchoolsScreen() {
  const m = useMessages();
  const [text, setText] = useState(useSearchParams().get("q") ?? "");
  const query = useQuery(`schools:${text}`, () => getApi().searchSchools(text));

  return (
    <PageShell
      eyebrow={m.shell.eyebrow.schools}
      title={m.schools.title}
      intro={m.schools.intro}
      hero={
        // The list answers as you type, so the form sends nothing.
        <HeroSearch
          id="school-query"
          label={m.landing.searchLabel}
          labelHidden
          onSubmit={(event) => event.preventDefault()}
        >
          <span aria-hidden="true" className="flex items-center pl-3">
            <Icon name="search" className="size-5" />
          </span>
          <input
            id="school-query"
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={m.landing.searchPlaceholder}
            autoComplete="off"
          />
        </HeroSearch>
      }
    >
      {query.error ? (
        <LoadError onRetry={query.reload} />
      ) : !query.data ? (
        <Loading />
      ) : query.data.length === 0 ? (
        <EmptyState>{m.schools.none}</EmptyState>
      ) : (
        <>
          <p aria-live="polite" className="mb-4 text-sm font-medium text-muted">
            {m.schools.results(query.data.length)}
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.map((school) => (
              <li key={school.id}>
                <SchoolCard school={school} />
              </li>
            ))}
          </ul>
        </>
      )}
    </PageShell>
  );
}
