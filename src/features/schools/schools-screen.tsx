"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/field";
import {
  Container,
  EmptyState,
  LoadError,
  Loading,
  PageHeader,
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
    <Container>
      <PageHeader title={m.schools.title} intro={m.schools.intro} />
      <label htmlFor="school-query" className="block max-w-xl">
        <span className="sr-only">{m.landing.searchLabel}</span>
        <Input
          id="school-query"
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={m.landing.searchPlaceholder}
          autoComplete="off"
        />
      </label>

      <div className="mt-6">
        {query.error ? (
          <LoadError onRetry={query.reload} />
        ) : !query.data ? (
          <Loading />
        ) : query.data.length === 0 ? (
          <EmptyState>{m.schools.none}</EmptyState>
        ) : (
          <>
            <p aria-live="polite" className="mb-3 text-sm font-semibold text-muted">
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
      </div>
    </Container>
  );
}
