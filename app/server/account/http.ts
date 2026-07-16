import { MembershipForbiddenError, UnauthenticatedError } from "../auth/errors";

import { PreferencesValidationError } from "./notification-preferences";

/**
 * Maps a thrown auth/account error to its HTTP response (M5-T5).
 *
 * One place turns the layer's typed errors into status codes so every account
 * (and, later, lifecycle) endpoint responds consistently — the typed 401/403/400
 * the contract specifies (`backend.md` §7). An unrecognized error becomes a
 * generic 500 with **no** internal detail, so nothing sensitive leaks into a
 * response body (`security_rules.hidden_state_log_redaction_required`).
 *
 * @see docs/03-architecture/backend.md §7, §12
 * @see docs/04-development/milestones/m5-auth.md (M5-T5)
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof UnauthenticatedError) {
    return Response.json(
      { error: "unauthenticated" },
      { status: error.status },
    );
  }
  if (error instanceof MembershipForbiddenError) {
    return Response.json({ error: error.code }, { status: error.status });
  }
  if (error instanceof PreferencesValidationError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "internal_error" }, { status: 500 });
}
