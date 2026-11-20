import { z } from "zod";
import { API_ERROR_STATUS, LedgerError, type ApiErrorCode } from "@/shared";

/** Success response in the shared envelope. */
export function ok<T>(data: T, status = 200, headers?: HeadersInit): Response {
  return Response.json({ data }, { status, headers });
}

/** Error response in the shared envelope, with the status that belongs to the code. */
export function fail(
  code: ApiErrorCode,
  message: string,
  headers?: HeadersInit,
): Response {
  return Response.json(
    { error: { code, message } },
    { status: API_ERROR_STATUS[code], headers },
  );
}

/** An error a route turns into a `fail(code, message)` response. */
export class HttpError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** The API error a refused ledger write maps to. Only contract refusals get here. */
export function httpErrorFromLedger(error: LedgerError): HttpError {
  const name = error.contractError ? ` (${error.contractError})` : "";
  switch (error.code) {
    case "self_verification":
    case "separation_of_duties":
    case "unauthorized":
      return new HttpError(
        "forbidden",
        `The ledger refused this write${name}: ${error.message}`,
      );
    case "invalid_state":
      return new HttpError(
        "invalid_transition",
        `The ledger refused this write${name}: ${error.message}`,
      );
    case "release_blocked":
      return new HttpError(
        "conflict",
        `The ledger will not let this release through yet${name}: ${error.message}`,
      );
    case "duplicate":
      return new HttpError(
        "conflict",
        `Already recorded on the ledger${name}: ${error.message}`,
      );
    case "not_found":
      return new HttpError("not_found", `Unknown on the ledger${name}: ${error.message}`);
    default:
      return new HttpError("ledger_unavailable", error.message);
  }
}

type Handler<P> = (request: Request, params: P) => Promise<Response>;

/**
 * Wrap a route handler: resolves the dynamic params, turns `HttpError`,
 * validation errors and ledger errors into envelope responses, and logs
 * anything unexpected as a 500. Reading the request up front also marks the
 * route as request-time for Cache Components, so nothing here is prerendered.
 */
export function route<P extends Record<string, string> = Record<string, never>>(
  handler: Handler<P>,
): (request: Request, context?: { params: Promise<P> | P }) => Promise<Response> {
  return async (request, context) => {
    request.headers.get("cookie");
    try {
      const params = (context ? await context.params : {}) as P;
      return await handler(request, params);
    } catch (error) {
      return responseFor(error);
    }
  };
}

export function responseFor(error: unknown): Response {
  if (error instanceof HttpError) return fail(error.code, error.message);
  if (error instanceof z.ZodError) return fail("invalid_input", z.prettifyError(error));
  if (error instanceof LedgerError) {
    const mapped = httpErrorFromLedger(error);
    return fail(mapped.code, mapped.message);
  }
  console.error("[api] unexpected error", error);
  return Response.json(
    { error: { code: "internal", message: "Something went wrong on the server." } },
    { status: 500 },
  );
}

/** Parse a JSON body with a schema; malformed JSON is `invalid_input`. */
export async function parseJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new HttpError("invalid_input", "Expected a JSON body.");
  }
  return schema.parse(body);
}

/** Parse the text fields of a multipart body with a schema; files come back separately. */
export async function parseForm<S extends z.ZodType>(
  request: Request,
  schema: S,
  fileField = "evidence",
): Promise<{ fields: z.infer<S>; files: File[] }> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError("invalid_input", "Expected a multipart form body.");
  }
  const fields: Record<string, string> = {};
  const files: File[] = [];
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value;
    else if (key === fileField) files.push(value);
  }
  return { fields: schema.parse(fields), files };
}

/** Query-string parameters as a plain object (first value wins). */
export function queryOf(request: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) out[key] ??= value;
  return out;
}

/** Boolean-ish form value: "true"/"1"/"on" → true. */
export const FormBoolean = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === "boolean" ? v : ["true", "1", "on", "yes"].includes(v),
  );
