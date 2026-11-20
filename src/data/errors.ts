/** A refused or failed call. `code` matches the backend error envelope. */
export class ApiError extends Error {
  constructor(
    readonly code:
      | "unauthenticated"
      | "forbidden"
      | "not_found"
      | "invalid_transition"
      /** 409 that is not a status move, e.g. a release the gate still blocks. */
      | "conflict"
      | "invalid_input",
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
