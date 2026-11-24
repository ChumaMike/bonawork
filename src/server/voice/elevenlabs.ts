/**
 * ElevenLabs on the server only. The key never reaches the browser: the
 * browser posts audio or text to `/api/voice/*`, which calls ElevenLabs here.
 *
 * - Speech to text: Scribe, `POST /v1/speech-to-text` (multipart: `model_id`,
 *   `file`, optional `language_code`). The person always reads and edits the
 *   words before anything is submitted.
 * - Text to speech: `POST /v1/text-to-speech/{voice_id}`, MP3 back.
 *
 * Without ELEVENLABS_API_KEY every call throws `VoiceNotConfigured`, which the
 * routes turn into a plain "Voice is not set up here" message.
 */
import type { SttLanguage } from "@/features/agent/contracts";

export const ELEVENLABS_BASE = "https://api.elevenlabs.io";
export const STT_MODEL = "scribe_v2";
export const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";
/** A premade ElevenLabs voice used in their own examples. Override with ELEVENLABS_VOICE_ID. */
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const STT_TIMEOUT_MS = 25_000;
const TTS_TIMEOUT_MS = 15_000;

/** ISO 639-3 codes, which Scribe accepts alongside ISO 639-1. */
export const SCRIBE_LANGUAGE: Record<SttLanguage, string> = {
  en: "eng",
  af: "afr",
  zu: "zul",
  xh: "xho",
  nso: "nso",
};

export class VoiceNotConfigured extends Error {
  constructor() {
    super("Voice is not set up here. Type your report instead.");
    this.name = "VoiceNotConfigured";
  }
}

export class VoiceFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceFailed";
  }
}

export interface VoiceConfig {
  apiKey?: string;
  voiceId?: string;
  ttsModel?: string;
  fetch?: typeof fetch;
}

function requireKey(config: VoiceConfig): string {
  if (!config.apiKey) throw new VoiceNotConfigured();
  return config.apiKey;
}

async function timed(
  doFetch: typeof fetch,
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  try {
    return await doFetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  } catch {
    throw new VoiceFailed("The voice service did not answer in time. Try again or type instead.");
  }
}

export interface Transcript {
  text: string;
  /** The language Scribe heard, as it reports it. */
  languageCode: string | null;
}

/** Audio in, words out. Retries once without a language when Scribe refuses the one asked for. */
export async function transcribe(
  config: VoiceConfig,
  audio: Blob,
  language: SttLanguage | null,
): Promise<Transcript> {
  const apiKey = requireKey(config);
  if (audio.size === 0) throw new VoiceFailed("The recording was empty. Try again.");
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new VoiceFailed("The recording is too long. Keep it under two minutes.");
  }
  const doFetch = config.fetch ?? fetch;

  const send = (lang: string | null) => {
    const form = new FormData();
    form.set("model_id", STT_MODEL);
    form.set("file", audio, "report.webm");
    if (lang) form.set("language_code", lang);
    return timed(
      doFetch,
      `${ELEVENLABS_BASE}/v1/speech-to-text`,
      { method: "POST", headers: { "xi-api-key": apiKey }, body: form },
      STT_TIMEOUT_MS,
    );
  };

  let response = await send(language ? SCRIBE_LANGUAGE[language] : null);
  if (language && (response.status === 400 || response.status === 422)) {
    response = await send(null);
  }
  if (!response.ok) {
    throw new VoiceFailed(
      response.status === 401
        ? "The voice service refused the key. Type your report instead."
        : "The voice service could not read this recording. Try again or type instead.",
    );
  }
  const body = (await response.json().catch(() => null)) as {
    text?: unknown;
    language_code?: unknown;
  } | null;
  if (!body || typeof body.text !== "string") {
    throw new VoiceFailed("The voice service gave an answer we could not read.");
  }
  return {
    text: body.text.trim().slice(0, 4_000),
    languageCode: typeof body.language_code === "string" ? body.language_code : null,
  };
}

/** Text in, MP3 out. */
export async function speak(config: VoiceConfig, text: string): Promise<ArrayBuffer> {
  const apiKey = requireKey(config);
  const doFetch = config.fetch ?? fetch;
  const voice = encodeURIComponent(config.voiceId || DEFAULT_VOICE_ID);
  const response = await timed(
    doFetch,
    `${ELEVENLABS_BASE}/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: config.ttsModel || DEFAULT_TTS_MODEL }),
    },
    TTS_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new VoiceFailed("The voice service could not read this out. The text is on the screen.");
  }
  return response.arrayBuffer();
}

/** The routes' answer when voice is not set up or fails: the shared error envelope. */
export function voiceErrorResponse(error: unknown): Response | null {
  if (error instanceof VoiceNotConfigured) {
    return Response.json(
      { error: { code: "not_configured", message: error.message } },
      { status: 503 },
    );
  }
  if (error instanceof VoiceFailed) {
    return Response.json({ error: { code: "voice_failed", message: error.message } }, { status: 502 });
  }
  return null;
}
