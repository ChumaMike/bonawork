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
  const log = useRef<HTMLDivElement>(null);
  const latest = useRef<HTMLDivElement>(null);

  // Bring the newest question to the top, so it is read with the start of its
  // answer. Before the first question, stay at the top of the greeting. Only
  // the message list scrolls: scrollIntoView would also nudge the panel itself.
  useEffect(() => {
    const list = log.current;
    const turn = latest.current;
    if (turns.length === 0 || !list || !turn) return;
    const top = turn.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTo?.({ top: list.scrollTop + top - 12, behavior: "smooth" });
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

  const bona =
    "max-w-[92%] self-start rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-2.5 leading-relaxed text-ink";
  const you =
    "max-w-[85%] self-end rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 leading-relaxed text-on-brand";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={log}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-canvas px-4 py-4 text-[0.9375rem]"
        aria-live="polite"
        data-testid="buddy-ask-result"
        data-status={status}
      >
        <div className={bona}>{greeting}</div>

        {/* Questions to tap, under the greeting until the first question is asked. */}
        {turns.length === 0 ? (
          <ul aria-label={b.suggestionsLabel} className="flex flex-col items-start gap-2">
            {suggestions.map((text) => (
              <li key={text}>
                <button
                  type="button"
                  onClick={() => send(text)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:border-brand hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  <Icon name="arrowRight" className="size-4 shrink-0 text-brand" />
                  {text}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {turns.map((turn) => (
          <div
            key={turn.id}
            ref={turn.id === turns.at(-1)?.id ? latest : undefined}
            className="flex scroll-mt-3 flex-col gap-2"
          >
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
      </div>

      <div className="shrink-0 border-t border-line bg-surface px-4 pt-3 pb-3">
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
              className="h-11 w-full rounded-full border border-line-strong bg-surface px-4 text-[0.9375rem] text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            />
          </label>
          <button
            type="submit"
            disabled={thinking || !draft.trim()}
            aria-label={a.send}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:bg-sunken disabled:text-faint"
          >
            <Icon name="send" className="size-5" />
          </button>
        </form>
        {/* A quiet note on what the answers are based on, with the way to the full page. */}
        <p className="mt-2 text-xs leading-snug text-muted">
          {a.sources}
          {USING_FIXTURES ? (
            <span data-testid="buddy-ask-notice"> {a.notice}</span>
          ) : null}
          {showFullPageLink ? (
            <>
              {" "}
              <Link
                href="/assistant"
                onClick={onNavigate}
                className="font-semibold whitespace-nowrap text-brand-strong underline underline-offset-2"
              >
                {b.fullPage}
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </div>
  );
}
