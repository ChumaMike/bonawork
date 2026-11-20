"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { IssueCard } from "@/components/issue-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Container, Notice } from "@/components/ui/page";
import { getApi, USING_FIXTURES } from "@/data/api";
import type { AssistantMessage } from "@/data/types";
import { useMessages } from "@/i18n";
import { SchoolCard } from "../schools/school-bits";

export function AssistantScreen() {
  const m = useMessages();
  const a = m.assistant;
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "greeting", role: "assistant", text: a.greeting },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 1) end.current?.scrollIntoView({ block: "end" });
  }, [messages, thinking]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || thinking) return;
    const mine: AssistantMessage = { id: `user-${messages.length}`, role: "user", text };
    const history = [...messages, mine];
    setMessages(history);
    setDraft("");
    setThinking(true);
    try {
      const reply = await getApi().askAssistant(history, text);
      setMessages([...history, reply]);
    } catch {
      setMessages([
        ...history,
        { id: `error-${history.length}`, role: "assistant", text: m.common.actionError },
      ]);
    } finally {
      setThinking(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  const sectionLabel = "text-xs font-semibold tracking-wide text-muted uppercase";

  return (
    <Container size="narrow" className="flex flex-col gap-4 pb-0 sm:pb-0">
      <header>
        <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight">
          <span className="flex size-10 items-center justify-center rounded-xl bg-brand text-on-brand">
            <Icon name="chat" />
          </span>
          {a.title}
        </h1>
        <p className="mt-2 text-muted">
          <span className="font-semibold text-ink">{a.careful}</span> {a.intro}
        </p>
        <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-brand-soft px-3 py-2 text-sm font-semibold text-brand-strong">
          <Icon name="shieldCheck" className="mt-0.5 size-4 shrink-0" />
          {a.sources}
        </p>
      </header>

      {USING_FIXTURES ? (
        <Notice tone="warning">
          <p data-testid="assistant-notice">{a.notice}</p>
        </Notice>
      ) : null}

      <section aria-label={a.conversation}>
        <ol role="log" aria-live="polite" className="flex flex-col gap-4">
          {messages.map((message) => (
            <li
              key={message.id}
              data-role={message.role}
              className={cn(
                "flex flex-col gap-3",
                message.role === "user" ? "items-end" : "items-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[90%] rounded-2xl px-4 py-3 whitespace-pre-line",
                  message.role === "user"
                    ? "rounded-br-md bg-brand text-on-brand"
                    : "rounded-bl-md border border-line bg-surface",
                )}
              >
                <span className="sr-only">
                  {message.role === "user" ? a.you : a.title}:{" "}
                </span>
                {message.text}
              </div>
              {message.school ? (
                <div className="w-full sm:max-w-md">
                  <p className={cn(sectionLabel, "mb-1.5")}>{a.aboutSchool}</p>
                  <SchoolCard school={message.school} />
                </div>
              ) : null}
              {message.issues?.length ? (
                <div className="w-full">
                  <p className={cn(sectionLabel, "mb-1.5 flex items-center gap-1")}>
                    <Icon name="file" className="size-3.5" />
                    {a.fromCases}
                  </p>
                  <ul className="flex w-full flex-col gap-3">
                    {message.issues.map((issue) => (
                      <li key={issue.id}>
                        <IssueCard issue={issue} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {message.actions?.length ? (
                <div className="w-full">
                  <p className={cn(sectionLabel, "mb-1.5")}>{a.nextSteps}</p>
                  <div className="flex flex-wrap gap-2">
                    {message.actions.map((action) => (
                      <ButtonLink
                        key={action.href}
                        href={action.href}
                        variant="secondary"
                        className="w-full sm:w-auto"
                      >
                        {action.label}
                        <Icon name="arrowRight" className="size-4" />
                      </ButtonLink>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>
          ))}
          {thinking ? (
            <li className="flex items-center gap-2 text-muted">
              <span
                aria-hidden="true"
                className="inline-flex size-2 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
              />
              {a.thinking}
            </li>
          ) : null}
        </ol>
        <div ref={end} className="h-px scroll-mb-40" />
      </section>

      {messages.length === 1 ? (
        <section aria-label={a.suggestionsLabel}>
          <p className={cn(sectionLabel, "mb-2")}>{a.suggestionsLabel}</p>
          <ul className="flex flex-col gap-2">
            {a.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line-strong bg-surface px-4 py-2 text-left font-semibold hover:border-brand"
                >
                  {suggestion}
                  <Icon name="arrowRight" className="size-4 shrink-0 text-brand" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Stays above the phone navigation bar. */}
      <form
        onSubmit={submit}
        className="sticky bottom-16 z-20 -mx-4 flex gap-2 border-t border-line bg-canvas px-4 py-3 sm:-mx-6 sm:px-6 lg:bottom-0"
      >
        <label htmlFor="assistant-input" className="flex-1">
          <span className="sr-only">{a.inputLabel}</span>
          <Input
            id="assistant-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={a.placeholder}
            autoComplete="off"
            className="min-h-14 sm:min-h-12"
          />
        </label>
        <Button
          type="submit"
          disabled={thinking || !draft.trim()}
          aria-label={a.send}
          className="min-h-14 sm:min-h-12"
        >
          <Icon name="send" />
          <span className="hidden sm:inline">{a.send}</span>
        </Button>
      </form>
    </Container>
  );
}
