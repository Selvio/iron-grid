/**
 * Typed failures for the action pipeline (M7-T2).
 *
 * The pipeline raises these; the actions `errorResponse` (`http.ts`) maps each to
 * its HTTP status. Each carries the HTTP `status` the contract implies and a
 * machine `code` extending `enums.validation_error_codes` where one exists
 * (`match_not_active`, `not_active_player`, `match_already_completed`) or a
 * layer-local code otherwise. Messages never carry hidden state
 * (`security_rules.hidden_state_log_redaction_required`).
 *
 * The stale-version conflict is `StateVersionConflictError` from the db layer
 * (`concurrency.ts`, code `stale_state_version`); `errorResponse` maps it to 409
 * with the current safe version — it is not redefined here.
 *
 * @see docs/03-architecture/backend.md §7, §8, §12
 * @see docs/04-development/milestones/m7-actions.md (M7-T2)
 */

/** A malformed action envelope or payload — a typed 400. */
export class InvalidActionError extends Error {
  readonly status = 400 as const;
  readonly code = "invalid_action" as const;

  constructor(message: string) {
    super(message);
    this.name = "InvalidActionError";
  }
}

/** A well-formed but unsupported/gated action type — a typed 422. */
export class UnsupportedActionError extends Error {
  readonly status = 422 as const;
  readonly code = "unsupported_action" as const;

  constructor(message = "That action type is not supported.") {
    super(message);
    this.name = "UnsupportedActionError";
  }
}

/** An action submitted against a non-active match — a typed 409. */
export class MatchNotActiveError extends Error {
  readonly status = 409 as const;
  readonly code = "match_not_active" as const;

  constructor(message = "The match is not active.") {
    super(message);
    this.name = "MatchNotActiveError";
  }
}

/** An action submitted by a player who is not the active player — a typed 409. */
export class NotActivePlayerError extends Error {
  readonly status = 409 as const;
  readonly code = "not_active_player" as const;

  constructor(message = "It is not your turn.") {
    super(message);
    this.name = "NotActivePlayerError";
  }
}

/** An action submitted against a completed match — a typed 409. */
export class MatchAlreadyCompletedError extends Error {
  readonly status = 409 as const;
  readonly code = "match_already_completed" as const;

  constructor(message = "The match is already completed.") {
    super(message);
    this.name = "MatchAlreadyCompletedError";
  }
}

/**
 * An action the engine rejected as illegal — a typed 422 carrying the engine's
 * `validation_error_codes`. Raised when `validateAction` returns `{valid:false}`;
 * nothing is committed (`action_processing.failure`).
 */
export class ActionValidationError extends Error {
  readonly status = 422 as const;
  readonly code = "invalid_action_legality" as const;
  /** The engine `ValidationError` codes that rejected the action. */
  readonly codes: readonly string[];

  constructor(codes: readonly string[]) {
    super(`Action rejected: ${codes.join(", ")}`);
    this.name = "ActionValidationError";
    this.codes = codes;
  }
}
