"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Icon } from "@/components/ui/icon";
import { getApi, USING_FIXTURES } from "@/data/api";
import type { AssistantMessage } from "@/data/types";
import { useMessages } from "@/i18n";

export type AskStatus = "idle" | "thinking" | "answer" | "error";

type Turn = {
  id: number;
  question: string;
  status: Exclude<AskStatus, "idle">;
  reply: AssistantMessage | null;
};

/** Matches the limit of `POST /api/assistant`. */
const MAX_QUESTION = 1000;
/** Keep the bubble small: a few links per answer, the full page for more. */
const MAX_CASES = 2;
const MAX_ACTIONS = 2;
/** Earlier turns kept on screen. */
const MAX_TURNS = 6;

/**
 * A short chat with Bona AI, through the same data-layer call as the full
 * assistant page. It lives in the buddy, not in the bubble, so the chat is
 * still there when the bubble is opened again.
 */
export function useBuddyAsk() {
  const [turns, setTurns] = useState<Turn[]>([]);
  // What was said so far, so a follow-up question keeps its context.
  const history = useRef<AssistantMessage[]>([]);
  const next = useRef(0);

  const ask = useCallback(async (question: string, retryOf?: number) => {
    const text = question.trim().slice(0, MAX_QUESTION);
    if (!text) return;
    const id = ++next.current;
    const sent: AssistantMessage[] = [
      ...history.current,
      { id: `buddy-user-${id}`, role: "user", text },
    ];
    setTurns((all) =>
      [
        ...all.filter((turn) => turn.id !== retryOf),
        { id, question: text, status: "thinking" as const, reply: null },
      ].slice(-MAX_TURNS),
    );
    const settle = (patch: Partial<Turn>) =>
      setTurns((all) =>
        all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)),
      );
    try {
      const reply = await getApi().askAssistant(sent, text);
      history.current = [
        ...sent,
        { id: reply.id, role: reply.role, text: reply.text },
      ].slice(-8);
      settle({ status: "answer", reply });
    } catch {
      settle({ status: "error" });
    }
  }, []);

  const last = turns.at(-1);
  return { turns, status: (last?.status ?? "idle") as AskStatus, ask };
}

const link =
  "inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-strong underline underline-offset-4";

/**
 * The chat in the buddy's speech bubble: Bona's greeting, the conversation as
 * message bubbles (yours on the right, Bona's on the left), questions to tap,
 * and a box to type in.
 */
export function BuddyChat({
  state,
  greeting,
  suggestions,
  showFullPageLink,
  onNavigate,
}: {
  state: ReturnType<typeof useBuddyAsk>;
  /** Bona's first message: help for the current screen. */
  greeting: ReactNode;
  suggestions: readonly string[];
  /** False on the assistant page itself. */
  showFullPageLink: boolean;
  /** Called when a link is followed, so the bubble can close. */
  onNavigate: () => void;
}) {
  const m = useMessages();
  const a = m.assistant;
  const b = m.buddy.ask;
  const [draft, setDraft] = useState("");
  const { turns, status } = state;
  const thinking = status === "thinking";
  const end = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [turns]);

  function send(text: string) {
    if (thinking || !text.trim()) return;
    void state.ask(text);
    setDraft("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send(draft);
  }

  const bona = "max-w-[90%] self-start rounded-2xl rounded-bl-md bg-brand-soft px-3 py-2";
  const you =
    "max-w-[85%] self-end rounded-2xl rounded-br-md bg-brand px-3 py-2 text-on-brand";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3 text-[0.9375rem]"
        aria-live="polite"
        data-testid="buddy-ask-result"
        data-status={status}
      >
        <div className={bona}>{greeting}</div>
        <p className="px-1 text-xs text-muted">
          {a.sources}
          {USING_FIXTURES ? (
            <span data-testid="buddy-ask-notice" className="mt-1 block">
              {a.notice}
            </span>
          ) : null}
        </p>

        {turns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-2">
            <p className={you}>
              <span className="sr-only">{a.you}: </span>
              {turn.question}
            </p>
            {turn.status === "thinking" ? (
              <p className={`${bona} flex items-center gap-1 text-muted`}>
                <span className="sr-only">{a.thinking}</span>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    aria-hidden="true"
                    className="bona-buddy-dot inline-flex size-1.5 rounded-full bg-brand"
                  />
                ))}
              </p>
            ) : null}
            {turn.status === "error" ? (
              <div className={`${bona} flex flex-col items-start gap-1`}>
                <p className="text-sm font-semibold text-danger">{b.error}</p>
                <button
                  type="button"
                  onClick={() => void state.ask(turn.question, turn.id)}
                  className={link}
                >
                  {m.common.retry}
                </button>
              </div>
            ) : null}
            {turn.status === "answer" && turn.reply ? (
              <div className={`${bona} flex flex-col gap-1`}>
                <p className="sr-only">{b.answerLabel}:</p>
                <p className="whitespace-pre-line">{turn.reply.text}</p>
                {turn.reply.school ? (
                  <Link
                    href={`/schools/${turn.reply.school.id}`}
                    onClick={onNavigate}
                    className={link}
                  >
                    <Icon name="school" className="size-4" />
                    {turn.reply.school.name}
                  </Link>
                ) : null}
                {turn.reply.issues?.slice(0, MAX_CASES).map((issue) => (
                  <Link
                    key={issue.id}
                    href={`/issues/${issue.id}`}
                    onClick={onNavigate}
                    className={link}
                  >
                    <Icon name="file" className="size-4" />
                    {issue.title}
                  </Link>
                ))}
                {turn.reply.actions?.slice(0, MAX_ACTIONS).map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    onClick={onNavigate}
                    className={link}
                  >
                    {action.label}
                    <Icon name="arrowRight" className="size-4" />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="shrink-0 border-t border-line px-3 pt-2 pb-3">
        {thinking ? null : (
          <ul
            aria-label={b.suggestionsLabel}
            className="-mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none]"
          >
            {suggestions.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => send(text)}
                  className="rounded-full border border-sun bg-surface px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-ink hover:bg-sun-soft"
                >
                  {text}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="flex items-center gap-2">
          <label htmlFor="buddy-question" className="min-w-0 flex-1">
            <span className="sr-only">{b.label}</span>
            <input
              id="buddy-question"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={b.placeholder}
              autoComplete="off"
              enterKeyHint="send"
              maxLength={MAX_QUESTION}
              className="h-10 w-full rounded-full border border-line-strong bg-surface px-4 text-[0.9375rem] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-brand"
            />
          </label>
          <button
            type="submit"
            disabled={thinking || !draft.trim()}
            aria-label={a.send}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand disabled:opacity-40"
          >
            <Icon name="send" className="size-5" />
          </button>
        </form>
        {showFullPageLink ? (
          <Link href="/assistant" onClick={onNavigate} className={`${link} mt-1 text-xs`}>
            {b.fullPage}
            <Icon name="arrowRight" className="size-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
