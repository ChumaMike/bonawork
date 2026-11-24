/**
 * Browser calls to the agent and voice routes. Each returns the route's
 * `data`, or throws an Error with the route's plain message.
 */

type Envelope<T> = { data: T } | { error: { code: string; message: string } };

export class AgentRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AgentRequestError";
  }
}

async function read<T>(response: Response): Promise<T> {
  let body: Envelope<T> | null = null;
  try {
    body = (await response.json()) as Envelope<T>;
  } catch {
    // fall through
  }
  if (body && "data" in body) return body.data;
  const error = body && "error" in body ? body.error : null;
  throw new AgentRequestError(
    error?.code ?? "internal",
    error?.message ?? "Something went wrong. Try again.",
  );
}

export async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return read<T>(response);
}

export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(path, { method: "POST", body: form });
  return read<T>(response);
}

/** TTS: an audio blob, or a thrown AgentRequestError (`not_configured` when there is no key). */
export async function fetchSpeech(text: string): Promise<Blob> {
  const response = await fetch("/api/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (response.ok && response.headers.get("content-type")?.startsWith("audio/")) {
    return response.blob();
  }
  return read<never>(response);
}
