import { StateVersionConflictError } from "../db";

import { ActionValidationError } from "./errors";

/**
 * Maps a thrown action-pipeline error to its HTTP response (M7-T2).
 *
 * Turns the layer's typed errors into the responses the contract specifies
 * (`backend.md` §7–§8): 400 malformed, 403 non-member, 409 conflicts, 422
 * illegal/unsupported. The stale-version `StateVersionConflictError` (from the db
 * layer, no `status` field) becomes a **409** carrying the current safe version
 * and no hidden state (`concurrency_rules.conflict_response`). An unrecognized
 * error is a generic 500 with no internal detail
 * (`security_rules.hidden_state_log_redaction_required`).
 *
 * @see docs/03-architecture/backend.md §7, §8, §12
 * @see docs/04-development/milestones/m7-actions.md (M7-T2)
 */

/** A typed error exposing an HTTP status and a stable machine code. */
interface TypedHttpError {
  readonly status: number;
  readonly code: string;
}

function isTypedHttpError(error: unknown): error is TypedHttpError {
  return (
    error instanceof Error &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

export function errorResponse(error: unknown): Response {
  // Stale optimistic-concurrency version — the safe version is returned so the
  // client can refresh (`concurrency_rules.conflict_response`).
  if (error instanceof StateVersionConflictError) {
    return Response.json(
      { error: error.code, currentStateVersion: error.currentStateVersion },
      { status: 409 },
    );
  }
  // Engine-rejected illegal action — surface the validation codes.
  if (error instanceof ActionValidationError) {
    return Response.json(
      { error: error.code, codes: error.codes },
      { status: error.status },
    );
  }
  if (isTypedHttpError(error)) {
    return Response.json({ error: error.code }, { status: error.status });
  }
  return Response.json({ error: "internal_error" }, { status: 500 });
}
