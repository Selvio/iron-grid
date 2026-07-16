/**
 * Maps a thrown lifecycle/auth error to its HTTP response (M6).
 *
 * Every typed error in the auth and lifecycle layers carries a numeric `status`
 * and a machine `code` (`errors.ts`, `auth/errors.ts`) — this turns any of them
 * into the response the contract specifies (`backend.md` §7): the typed
 * 401/403/404/409/400. An unrecognized error becomes a generic 500 with **no**
 * internal detail, so nothing sensitive leaks into a body
 * (`security_rules.hidden_state_log_redaction_required`).
 *
 * @see docs/03-architecture/backend.md §7, §12
 * @see docs/04-development/milestones/m6-lifecycle.md (§3)
 */

/** A typed error exposing an HTTP status and a stable machine code. */
interface TypedHttpError {
  readonly status: number;
  readonly code: string;
}

/** True when `error` is one of the layer's typed status-bearing errors. */
function isTypedHttpError(error: unknown): error is TypedHttpError {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

/** Maps any auth/lifecycle typed error to its response; unknown → generic 500. */
export function errorResponse(error: unknown): Response {
  if (isTypedHttpError(error)) {
    return Response.json({ error: error.code }, { status: error.status });
  }
  return Response.json({ error: "internal_error" }, { status: 500 });
}
