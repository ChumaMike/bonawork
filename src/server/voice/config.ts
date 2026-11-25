import { env } from "../env";
import type { VoiceConfig } from "./elevenlabs";

/** ElevenLabs settings from the environment. Server only. */
export function voiceConfig(): VoiceConfig {
  const e = env();
  return {
    apiKey: e.ELEVENLABS_API_KEY,
    voiceId: e.ELEVENLABS_VOICE_ID,
    ttsModel: e.ELEVENLABS_TTS_MODEL,
  };
}
