/**
 * Typed lifecycle failures (M6).
 *
 * The lifecycle endpoints raise these; the endpoint layer maps each to its HTTP
 * status via `errorResponse` (`http.ts`). Each carries the HTTP `status` the
 * contract implies and a `code` that extends `enums.validation_error_codes`
 * additively (`m6-lifecycle.md` §3) — the enum is otherwise gameplay-action
 * oriented and has no lifecycle codes. Messages never carry secrets — no
 * invitation code, session token or opaque id (`security_rules`).
 *
 * @see docs/03-architecture/backend.md §7, §12
 * @see docs/04-development/milestones/m6-lifecycle.md (§3)
 */

/** A malformed or unknown create-match body — a typed 400. */
export class InvalidMatchSettingsError extends Error {
  readonly status = 400 as const;
  readonly code = "invalid_match_settings" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidMatchSettingsError";
  }
}

/** A join with no matching joinable invitation code — a typed 404. */
export class InvalidInvitationCodeError extends Error {
  readonly status = 404 as const;
  readonly code = "invalid_invitation_code" as const;

  constructor(message = "No open match matches that invitation code.") {
    super(message);
    this.name = "InvalidInvitationCodeError";
  }
}

/** A match that cannot accept the join (already full / wrong status) — 409. */
export class MatchNotJoinableError extends Error {
  readonly status = 409 as const;
  readonly code = "match_not_joinable" as const;

  constructor(message = "This match cannot be joined.") {
    super(message);
    this.name = "MatchNotJoinableError";
  }
}

/** A commander/faction already taken or not in the roster — a typed 409. */
export class CommanderUnavailableError extends Error {
  readonly status = 409 as const;
  readonly code = "commander_unavailable" as const;

  constructor(message = "That commander or faction is unavailable.") {
    super(message);
    this.name = "CommanderUnavailableError";
  }
}

/** An operation attempted from the wrong lifecycle status — a typed 409. */
export class InvalidLifecycleTransitionError extends Error {
  readonly status = 409 as const;
  readonly code = "invalid_lifecycle_transition" as const;

  constructor(message = "Not allowed from the match's current status.") {
    super(message);
    this.name = "InvalidLifecycleTransitionError";
  }
}

/** Activation requested before both players are ready — a typed 409. */
export class PlayersNotReadyError extends Error {
  readonly status = 409 as const;
  readonly code = "players_not_ready" as const;

  constructor(message = "Both players must be ready.") {
    super(message);
    this.name = "PlayersNotReadyError";
  }
}

/** The caller exceeded the invitation rate limit — a typed 429. */
export class RateLimitedError extends Error {
  readonly status = 429 as const;
  readonly code = "rate_limited" as const;

  constructor(message = "Too many requests; try again later.") {
    super(message);
    this.name = "RateLimitedError";
  }
}
