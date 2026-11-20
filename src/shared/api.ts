import { z } from "zod";

/** Error codes every API route uses, with their HTTP status. */
export const API_ERROR_STATUS = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_transition: 409,
  conflict: 409,
  invalid_input: 422,
  ledger_unavailable: 503,
} as const;
export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.enum(Object.keys(API_ERROR_STATUS) as [ApiErrorCode, ...ApiErrorCode[]]),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Success body: `{ "data": … }`. Wrap any schema with this to parse a response. */
export function apiSuccessSchema<T extends z.ZodType>(data: T) {
  return z.object({ data });
}
export type ApiSuccess<T> = { data: T };
