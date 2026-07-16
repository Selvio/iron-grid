/**
 * Typed authorization failures for the server-only auth layer (M5-T3).
 *
 * The auth primitives raise these rather than returning a bare status so callers
 * (the M6 lifecycle and M7 action pipeline) can map them to HTTP responses in one
 * place. Each carries the HTTP `status` the contract specifies (`backend.md` §7):
 * an unauthenticated request is a **401**; the non-member 403 arrives with the
 * membership guard in M5-T4.
 *
 * Messages are intentionally free of tokens, session ids or match ids — nothing
 * secret is placed on an error that may be logged
 * (`security_rules.hidden_state_log_redaction_required`).
 *
 * @see docs/03-architecture/backend.md §7, §12
 * @see docs/04-development/milestones/m5-auth.md (M5-T3)
 */

/** Raised when no authenticated session resolves a `User` — a typed 401. */
export class UnauthenticatedError extends Error {
  /** HTTP status the endpoint layer maps this to. */
  readonly status = 401 as const;

  constructor(message = "Authentication required.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}
