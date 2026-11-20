/**
 * The model provider behind every Bona AI feature: one injectable text
 * generator. Production uses the Vercel AI Gateway through the `ai` package;
 * tests pass a stub. The generator is given text and returns text. It has no
 * tools, so a model can never write a record, call the ledger or act.
 */

/** A text generator: `generateText` from `ai` in production, a stub in tests. */
export type Generate = (input: {
  model: string;
  system: string;
  prompt: string;
  timeoutMs: number;
  /** Upper bound on the answer. Defaults to 600 tokens. */
  maxOutputTokens?: number;
}) => Promise<string>;

/** What an AI feature needs. No database, no ledger, no session. */
export interface AiDeps {
  /** Null when AI is off or no provider is configured: the code-written path answers. */
  generate: Generate | null;
  model: string;
  /** How long to wait for the provider. Defaults to `AI_TIMEOUT_MS`; tests shorten it. */
  timeoutMs?: number;
}

/**
 * The production generator: Vercel AI Gateway through the `ai` package. With no
 * key the gateway authenticates with the Vercel project's OIDC token.
 */
export function gatewayGenerate(apiKey?: string): Generate {
  return async ({ model, system, prompt, timeoutMs, maxOutputTokens }) => {
    const { generateText, createGateway } = await import("ai");
    const gateway = createGateway(apiKey ? { apiKey } : {});
    const result = await generateText({
      model: gateway(model),
      instructions: system,
      prompt,
      maxRetries: 0,
      timeout: timeoutMs,
      maxOutputTokens: maxOutputTokens ?? 600,
    });
    return result.text;
  };
}

export type AiEnv = {
  AI_GATEWAY_API_KEY?: string;
  AI_MODE: "auto" | "off";
  AI_MODEL: string;
  VERCEL?: string;
};

/** Which way Bona AI answers: through the gateway, or the code-written fallback. */
export function assistantMode(env: AiEnv): "gateway" | "fallback" {
  if (env.AI_MODE === "off") return "fallback";
  return env.AI_GATEWAY_API_KEY || env.VERCEL ? "gateway" : "fallback";
}

/** The provider for the features that need no database. */
export function aiDeps(env: AiEnv): AiDeps {
  return {
    generate:
      assistantMode(env) === "gateway" ? gatewayGenerate(env.AI_GATEWAY_API_KEY) : null,
    model: env.AI_MODEL,
  };
}
