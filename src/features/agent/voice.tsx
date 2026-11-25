"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { STT_LANGUAGES, type SttLanguage } from "./contracts";
import { AgentRequestError, fetchSpeech, postForm } from "./client";

/** Two minutes is plenty for a report and keeps the upload small. */
const MAX_RECORDING_MS = 120_000;

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </svg>
  );
}

function SpeakerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}

type SpeakState = "idle" | "recording" | "sending";

/**
 * "Speak to report": record in English, Afrikaans, isiZulu, isiXhosa or
 * Sepedi, and the words land in the text box through `onText` for the person
 * to read and fix. It never submits anything itself.
 */
export function SpeakToReport({
  onText,
  defaultLanguage = "en",
}: {
  /** Called with what was heard. Append or replace the draft; the person edits it after. */
  onText: (text: string) => void;
  defaultLanguage?: SttLanguage;
}) {
  const [language, setLanguage] = useState<SttLanguage>(defaultLanguage);
  const [state, setState] = useState<SpeakState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  async function start() {
    setMessage(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setMessage("This browser cannot record. Type your report instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setMessage("The microphone is blocked. Allow it, or type your report.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      void send(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
    };
    recorder.current = rec;
    rec.start();
    setState("recording");
    timer.current = setTimeout(() => stop(), MAX_RECORDING_MS);
  }

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  async function send(audio: Blob) {
    setState("sending");
    const form = new FormData();
    form.set("audio", audio, "report.webm");
    form.set("language", language);
    try {
      const { text } = await postForm<{ text: string }>("/api/voice/stt", form);
      if (text) {
        onText(text);
        setMessage("Check the words below and fix anything we heard wrong.");
      } else {
        setMessage("We did not hear any words. Try again closer to the phone.");
      }
    } catch (error) {
      setMessage(error instanceof AgentRequestError ? error.message : "Voice failed. Type instead.");
    } finally {
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="speak-language" className="sr-only">
          Language
        </label>
        <Select
          id="speak-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as SttLanguage)}
          disabled={state !== "idle"}
          className="min-w-40"
        >
          {Object.entries(STT_LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
        {state === "recording" ? (
          <Button variant="danger" size="sm" onClick={stop}>
            <MicIcon className="size-5" />
            Stop and use this
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={start} loading={state === "sending"}>
            <MicIcon className="size-5" />
            Speak to report
          </Button>
        )}
      </div>
      {state === "recording" ? (
        <p className="text-sm text-muted" role="status">
          Recording. Say what is broken and where.
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-muted" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** A small "Read aloud" button. Speaks `text` through ElevenLabs; says so plainly when voice is off. */
export function ReadAloud({ text, label = "Read aloud" }: { text: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  async function play() {
    setNote(null);
    setBusy(true);
    try {
      const blob = await fetchSpeech(text);
      const url = URL.createObjectURL(blob);
      audio.current?.pause();
      const player = new Audio(url);
      player.onended = () => URL.revokeObjectURL(url);
      audio.current = player;
      await player.play();
    } catch (error) {
      setNote(
        error instanceof AgentRequestError && error.code === "not_configured"
          ? "Voice is not set up here."
          : "Could not read this aloud.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="quiet" size="sm" onClick={play} loading={busy} aria-label={`${label}: ${text.slice(0, 60)}`}>
        <SpeakerIcon className="size-5" />
        {label}
      </Button>
      {note ? (
        <span className="text-sm text-muted" role="status">
          {note}
        </span>
      ) : null}
    </span>
  );
}
