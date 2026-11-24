import { SttLanguageSchema } from "@/features/agent/contracts";
import { HttpError, ok, responseFor, route } from "@/server/http";
import { voiceConfig } from "@/server/voice/config";
import { transcribe, voiceErrorResponse } from "@/server/voice/elevenlabs";

/**
 * `POST /api/voice/stt` — "Speak to report". Multipart `audio` (the recording)
 * and `language` (en, af, zu, xh, nso; optional). Returns `{ text, languageCode }`
 * for the person to read and edit. Nothing is submitted from here.
 */
export const POST = route(async (request) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError("invalid_input", "Expected a recording.");
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) throw new HttpError("invalid_input", "Expected a recording.");
  const rawLanguage = form.get("language");
  const language =
    typeof rawLanguage === "string" && rawLanguage
      ? SttLanguageSchema.parse(rawLanguage)
      : null;
  try {
    return ok(await transcribe(voiceConfig(), audio, language));
  } catch (error) {
    return voiceErrorResponse(error) ?? responseFor(error);
  }
});
