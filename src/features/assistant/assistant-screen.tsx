"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { IssueCard } from "@/components/issue-card";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Textarea } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { Notice, PageShell } from "@/components/ui/page";
import { getApi, USING_FIXTURES } from "@/data/api";
import type { AssistantMessage } from "@/data/types";
import { useMessages } from "@/i18n";
import { SchoolCard } from "../schools/school-bits";

/** The message box grows with what is typed, up to this height, then scrolls. */
const MAX_INPUT_PX = 168;

const sectionLabel = "text-xs font-medium tracking-wider text-muted uppercase";
const focusRing =
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand";
const bonaBubble =
  "rounded-2xl rounded-tl-md border border-line bg-surface text-ink shadow-card";

/**
 * The Bona AI page: what it can and cannot do, a few questions to start
 * with, the conversation, and a box to type in. Bona AI explains and answers
 * from recorded cases. It never approves, verifies or authorises anything.
 */
export function AssistantScreen() {
  const m = useMessages();
  const a = m.assistant;
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { id: "greeting", role: "assistant", text: a.greeting },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  /** The question that could not be answered, so it can be sent again. */
  const [failed, setFailed] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messages.length > 1) end.current?.scrollIntoView?.({ block: "end" });
  }, [messages, thinking, failed]);

  // Grow the box with its text.
  useLayoutEffect(() => {
    const box = input.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = `${Math.min(box.scrollHeight, MAX_INPUT_PX)}px`;
  }, [draft]);

  async function ask(question: string, retry = false) {
    const text = question.trim();
    if (!text || thinking) return;
    // A retry sends the same question again: it is already in the conversation.
    const history: AssistantMessage[] = retry
      ? messages
      : [...messages, { id: `user-${messages.length}`, role: "user", text }];
    setMessages(history);
    setFailed(null);
    if (!retry) setDraft("");
    setThinking(true);
    try {
      const reply = await getApi().askAssistant(history, text);
      setMessages([...history, reply]);
    } catch {
      setFailed(text);
    } finally {
      setThinking(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  // Enter sends; Shift+Enter is a new line. Not while an input method is composing.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void ask(draft);
  }

  const started = messages.length > 1;

  return (
    <PageShell
      eyebrow={m.shell.eyebrow.assistant}
      title={a.title}
      intro={
        <>
          {a.careful} {a.intro}
        </>
      }
      // What it is for, before anyone asks: it explains, it never decides.
      hero={
        <div
          data-testid="assistant-scope"
          className="grid gap-4 rounded-2xl border border-white/20 bg-white/10 p-4 text-left text-white sm:grid-cols-2 sm:p-5"
        >
          {(
            [
              { title: a.canTitle, lines: a.can, icon: "check", tone: "text-white" },
              {
                title: a.cannotTitle,
                lines: a.cannot,
                icon: "ban",
                tone: "text-white/75",
              },
            ] satisfies {
              title: string;
              lines: readonly string[];
              icon: IconName;
              tone: string;
            }[]
          ).map((column) => (
            <div key={column.title}>
              <p className="font-semibold">{column.title}</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[0.95rem] text-white/90">
                {column.lines.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Icon
                      name={column.icon}
                      className={cn("mt-1 size-4 shrink-0", column.tone)}
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      }
      size="compact"
      width="narrow"
      className="flex flex-col gap-5"
    >
      {USING_FIXTURES ? (
        <Notice tone="info">
          <p data-testid="assistant-notice">{a.notice}</p>
        </Notice>
      ) : null}

      <section aria-label={a.conversation}>
        <ol role="log" aria-live="polite" className="flex flex-col gap-5">
          {messages.map((message) => {
            const mine = message.role === "user";
            return (
              <li
                key={message.id}
                data-role={message.role}
                className={cn("flex flex-col gap-3", mine ? "items-end" : "items-start")}
              >
                {mine ? null : (
                  <p
                    aria-hidden="true"
                    className="-mb-1.5 flex items-center gap-1.5 text-sm font-medium text-muted"
                  >
                    <Icon name="chat" className="size-4 text-brand" />
                    {a.title}
                  </p>
                )}
                <div
                  className={cn(
                    "max-w-[min(88%,36rem)] px-4 py-3 leading-relaxed whitespace-pre-line",
                    mine
                      ? "rounded-2xl rounded-br-md bg-brand text-on-brand"
                      : bonaBubble,
                  )}
                >
                  <span className="sr-only">{mine ? a.you : a.title}: </span>
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
            );
          })}
          {thinking ? (
            <li data-testid="assistant-thinking" className="flex items-start">
              <p
                className={cn(
                  bonaBubble,
                  "flex items-center gap-2.5 px-4 py-3 text-muted",
                )}
              >
                <span aria-hidden="true" className="flex gap-1">
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="inline-flex size-1.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
                      style={{ animationDelay: `${dot * 200}ms` }}
                    />
                  ))}
                </span>
                {a.thinking}
              </p>
            </li>
          ) : null}
          {failed && !thinking ? (
            <li data-testid="assistant-error" className="flex items-start">
              <div className="flex max-w-[min(88%,36rem)] flex-col items-start gap-2 rounded-2xl rounded-tl-md border border-danger/30 bg-danger-soft px-4 py-3">
                <p className="flex items-start gap-2 font-medium text-danger-strong">
                  <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
                  {a.error}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void ask(failed, true)}
                >
                  {m.common.retry}
                </Button>
              </div>
            </li>
          ) : null}
        </ol>
        <div ref={end} className="h-px scroll-mb-48" />
      </section>

      {started ? null : (
        <section aria-labelledby="assistant-starters">
          <p id="assistant-starters" className={cn(sectionLabel, "mb-2")}>
            {a.suggestionsLabel}
          </p>
          <ul className="flex flex-wrap gap-2">
            {a.suggestions.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => ask(suggestion)}
                  className={cn(
                    "min-h-11 rounded-full border border-line bg-surface px-4 py-2 text-left text-[0.95rem] font-medium text-ink shadow-card transition-colors hover:border-brand hover:text-brand-strong",
                    focusRing,
                  )}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Stays above the phone navigation bar. */}
      <form
        onSubmit={submit}
        className={cn(
          "flex flex-col gap-1.5 bg-canvas py-3",
          // Once there is a conversation to scroll, the box stays in reach.
          started && "sticky bottom-16 z-20 lg:bottom-0",
        )}
      >
        <div className="flex items-end gap-2">
          <label htmlFor="assistant-input" className="min-w-0 flex-1">
            <span className="sr-only">{a.inputLabel}</span>
            <Textarea
              ref={input}
              id="assistant-input"
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={a.placeholder}
              autoComplete="off"
              enterKeyHint="send"
              aria-describedby="assistant-keys"
              className="block min-h-14 resize-none! overflow-y-auto sm:min-h-12"
            />
          </label>
          <Button
            type="submit"
            disabled={thinking || !draft.trim()}
            aria-label={a.send}
            className="min-h-14 shrink-0 sm:min-h-12"
          >
            {thinking ? (
              <Icon name="loader" className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Icon name="send" />
            )}
            <span className="hidden sm:inline">{a.send}</span>
          </Button>
        </div>
        <p id="assistant-keys" className="hidden px-1 text-xs text-muted sm:block">
          {a.keyHint}
        </p>
      </form>
    </PageShell>
  );
}
