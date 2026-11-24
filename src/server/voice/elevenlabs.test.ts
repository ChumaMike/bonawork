import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VOICE_ID,
  VoiceFailed,
  VoiceNotConfigured,
  speak,
  transcribe,
  voiceErrorResponse,
} from "./elevenlabs";

const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });

describe("ElevenLabs speech to text", () => {
  it("says voice is not set up when there is no key, without calling anyone", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(transcribe({ fetch: fetcher }, audio, "zu")).rejects.toBeInstanceOf(
      VoiceNotConfigured,
    );
    expect(fetcher).not.toHaveBeenCalled();
    const response = voiceErrorResponse(new VoiceNotConfigured());
    expect(response?.status).toBe(503);
    expect((await response!.json()).error.code).toBe("not_configured");
  });

  it("sends Scribe the model, the file and the language, with the key in a header", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ text: " Amanzi awaphumi. ", language_code: "zul" })),
    );
    const result = await transcribe({ apiKey: "k", fetch: fetcher }, audio, "zu");
    expect(result).toEqual({ text: "Amanzi awaphumi.", languageCode: "zul" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((init?.headers as Record<string, string>)["xi-api-key"]).toBe("k");
    const form = init?.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("language_code")).toBe("zul");
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("tries again without a language when Scribe refuses the language", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("bad language", { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "Die kraan lek." })));
    const result = await transcribe({ apiKey: "k", fetch: fetcher }, audio, "nso");
    expect(result.text).toBe("Die kraan lek.");
    expect((fetcher.mock.calls[1][1]?.body as FormData).get("language_code")).toBeNull();
  });

  it("refuses empty audio and reports a failed call in plain words", async () => {
    await expect(transcribe({ apiKey: "k" }, new Blob([]), null)).rejects.toBeInstanceOf(
      VoiceFailed,
    );
    const failing = vi.fn<typeof fetch>(async () => new Response("", { status: 500 }));
    await expect(transcribe({ apiKey: "k", fetch: failing }, audio, null)).rejects.toThrow(
      /could not read this recording/,
    );
  });
});

describe("ElevenLabs text to speech", () => {
  it("posts the text to the voice and returns the audio", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new Uint8Array([9, 9])));
    const out = await speak({ apiKey: "k", fetch: fetcher }, "R1 200.00 is held.");
    expect(new Uint8Array(out)).toEqual(new Uint8Array([9, 9]));
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toContain(`/v1/text-to-speech/${DEFAULT_VOICE_ID}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "R1 200.00 is held.",
      model_id: "eleven_multilingual_v2",
    });
  });

  it("is not configured without a key", async () => {
    await expect(speak({}, "hello")).rejects.toBeInstanceOf(VoiceNotConfigured);
  });
});
