import { TtsRequestSchema } from "@/features/agent/contracts";
import { parseJson, responseFor, route } from "@/server/http";
import { voiceConfig } from "@/server/voice/config";
import { speak, voiceErrorResponse } from "@/server/voice/elevenlabs";

/**
 * `POST /api/voice/tts` — read text aloud. `{ text }` in, `audio/mpeg` out.
 * Used for "Where's the money?" answers and checklist items.
 */
export const POST = route(async (request) => {
  const { text } = await parseJson(request, TtsRequestSchema);
  try {
    const audio = await speak(voiceConfig(), text);
    return new Response(audio, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return voiceErrorResponse(error) ?? responseFor(error);
  }
});
