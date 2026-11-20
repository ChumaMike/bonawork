/** A refused or failed call. `code` matches the backend error envelope. */
export class ApiError extends Error {
  constructor(
    readonly code: "unauthenticated" | "forbidden" | "not_found" | "invalid_transition",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
