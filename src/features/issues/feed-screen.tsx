"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { IssueCard } from "@/components/issue-card";
import { STATUS_STYLE } from "@/components/status";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Field, Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import {
  Container,
  EmptyState,
  LoadError,
  Loading,
  PageHeader,
} from "@/components/ui/page";
import { getApi } from "@/data/api";
import {
  ISSUE_CATEGORIES,
  ISSUE_STATUSES,
  type IssueCategory,
  type IssueFilter,
  type IssueStatus,
} from "@/data/types";
import { useQuery } from "@/data/use-query";
import { useMessages } from "@/i18n";

const isStatus = (value: string | null): value is IssueStatus =>
  ISSUE_STATUSES.includes(value as IssueStatus);

export function FeedScreen() {
  const m = useMessages();
  const params = useSearchParams();
  const initialStatus = params.get("status");
  const [text, setText] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState<IssueStatus | "">(
    isStatus(initialStatus) ? initialStatus : "",
  );
  const [category, setCategory] = useState<IssueCategory | "">("");
  const [sort, setSort] = useState<NonNullable<IssueFilter["sort"]>>("recent");

  const filter: IssueFilter = {
    query: text,
    status: status || undefined,
    category: category || undefined,
    sort,
  };
  const query = useQuery(`issues:${JSON.stringify(filter)}`, () =>
    getApi().listIssues(filter),
  );
  const filtered = Boolean(text || status || category);

  function clear() {
    setText("");
    setStatus("");
    setCategory("");
  }

  const chip =
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 font-semibold";

  return (
    <Container>
      <PageHeader title={m.feed.title} intro={m.feed.intro} />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <Field
            id="issue-query"
            label={m.feed.searchLabel}
            className="col-span-2 md:col-span-1"
          >
            <Input
              id="issue-query"
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={m.feed.searchPlaceholder}
              autoComplete="off"
            />
          </Field>
          <Field id="issue-category" label={m.feed.categoryLabel}>
            <Select
              id="issue-category"
              value={category}
              onChange={(event) => setCategory(event.target.value as IssueCategory | "")}
            >
              <option value="">{m.feed.all}</option>
              {ISSUE_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {m.category[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="issue-sort" label={m.feed.sortLabel}>
            <Select
              id="issue-sort"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as NonNullable<IssueFilter["sort"]>)
              }
            >
              <option value="recent">{m.feed.sortRecent}</option>
              <option value="most_affected">{m.feed.sortAffected}</option>
            </Select>
          </Field>
        </div>

        <div role="group" aria-label={m.feed.statusLabel}>
          {/* Scrolls sideways on small screens instead of wrapping into a wall of chips. */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <button
              type="button"
              aria-pressed={status === ""}
              onClick={() => setStatus("")}
              className={cn(
                chip,
                status === ""
                  ? "border-ink bg-ink text-canvas"
                  : "border-line-strong bg-surface",
              )}
            >
              {m.feed.all}
            </button>
            {ISSUE_STATUSES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => setStatus(status === value ? "" : value)}
                className={cn(
                  chip,
                  status === value
                    ? cn("border-current", STATUS_STYLE[value].badge)
                    : "border-line-strong bg-surface",
                )}
              >
                <Icon name={STATUS_STYLE[value].icon} className="size-4" />
                {m.status.label[value]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        {query.error ? (
          <LoadError onRetry={query.reload} />
        ) : !query.data ? (
          <Loading />
        ) : (
          <>
            <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
              <p aria-live="polite" className="text-sm font-semibold text-muted">
                {m.feed.results(query.data.length)}
              </p>
              {filtered ? (
                <Button variant="quiet" size="sm" onClick={clear} className="px-0">
                  {m.feed.clear}
                </Button>
              ) : null}
            </div>
            {query.data.length === 0 ? (
              <EmptyState>{m.feed.none}</EmptyState>
            ) : (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {query.data.map((issue) => (
                  <li key={issue.id}>
                    <IssueCard issue={issue} heading="h2" />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Container>
  );
}
