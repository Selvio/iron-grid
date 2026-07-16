/**
 * Typed authorization failures for the server-only auth layer (M5-T3).
 *
 * The auth primitives raise these rather than returning a bare status so callers
 * (the M6 lifecycle and M7 action pipeline) can map them to HTTP responses in one
 * place. Each carries the HTTP `status` the contract specifies (`backend.md` §7):
 * an unauthenticated request is a **401**; a session that is neither host nor
 * accepted guest is a **403** (M5-T4).
 *
 * Messages are intentionally free of tokens, session ids or match ids — nothing
 * secret is placed on an error that may be logged
 * (`security_rules.hidden_state_log_redaction_required`).
 *
 * @see docs/03-architecture/backend.md §7, §12
 * @see docs/04-development/milestones/m5-auth.md (M5-T3, T4)
 */

/** Raised when no authenticated session resolves a `User` — a typed 401. */
export class UnauthenticatedError extends Error {
  /** HTTP status the endpoint layer maps this to. */
  readonly status = 401 as const;
  /** Stable machine code for the response body. */
  readonly code = "unauthenticated" as const;

  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

/**
 * Raised when the session is neither the host nor an accepted guest of the match
 * — a typed 403 (M5-T4).
 *
 * A **missing** match raises the *same* error as a genuine non-member: the guard
 * must not let a caller distinguish "no such match" from "not your match", or it
 * would leak match existence (`security_rules.hidden_state_log_redaction_required`,
 * `backend.md` §12). The `code` matches `enums.validation_error_codes.not_match_player`.
 */
export class MembershipForbiddenError extends Error {
  /** HTTP status the endpoint layer maps this to. */
  readonly status = 403 as const;
  /** Matches `rules.yaml` → enums.validation_error_codes. */
  readonly code = "not_match_player" as const;

  constructor(message = "Not a member of this match.") {
    super(message);
    this.name = "MembershipForbiddenError";
  }
}
