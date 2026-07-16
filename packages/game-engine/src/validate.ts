/**
 * `validateAction` — the engine-owned legality check of a submitted action
 * (`rules.yaml` → `action_processing.validate_action_legality`, §11).
 *
 * This covers only the steps the pure engine owns: is the match active, is the
 * requester the active player, and is the action itself legal against the game
 * state. Authentication, match membership, the expected-state-version guard and
 * persistence are backend concerns (M7, `action_processing` steps 1–4), not the
 * engine. Reasons are aggregated so the caller sees every problem at once.
 *
 * M2 resolves `move_and_wait` and `end_turn`; every other action type is
 * rejected as `invalid_action_type` until its system lands in M3.
 *
 * @see docs/02-data/rules.yaml → action_processing, enums.validation_error_codes
 * @see docs/01-specification/game-specification.md §10, §11
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T4)
 */

import type { GameData } from "game-data";

import { unitById } from "./board";
import type { Action, MoveAndWaitAction } from "./actions";
import { validateCapture } from "./capture";
import { validateAttack } from "./combat";
import { validateActivatePower } from "./commanders";
import { validateJoin } from "./join";
import { validateProduce } from "./production";
import { validateDive, validateSurface } from "./submarine";
import { validateSupply } from "./supply";
import { validateLoad, validateUnload } from "./transport";
import { calculateVisibility } from "./visibility";
import type { ValidationError, ValidationResult } from "./engine";
import { validateMovementPath } from "./movement";
import type { MatchState } from "./state";

const VALID: ValidationResult = { valid: true };

/** Wrap collected errors as a result, or report success when there are none. */
function result(errors: readonly ValidationError[]): ValidationResult {
  return errors.length === 0 ? VALID : { valid: false, errors };
}

/**
 * Preconditions shared by every turn action: the match must be active and the
 * requester must be the player whose turn it is (`action_processing`, §11).
 */
function turnPreconditions(
  state: MatchState,
  action: Action,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (state.match.status !== "active") {
    errors.push({ code: "match_not_active" });
  }
  if (action.playerId !== state.match.activePlayerId) {
    errors.push({ code: "not_active_player" });
  }
  return errors;
}

/**
 * Clock-free preconditions for `claim_victory` (§4.4): the match must be active
 * and the claimant must be a real player who is **not** the active one. The
 * deadline-expired gate is enforced by the backend, not here.
 */
function claimPreconditions(
  state: MatchState,
  action: Action,
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (state.match.status !== "active") {
    errors.push({ code: "match_not_active" });
  }
  const isMember = state.players.some((p) => p.playerId === action.playerId);
  if (!isMember || action.playerId === state.match.activePlayerId) {
    errors.push({ code: "victory_claim_unavailable" });
  }
  return errors;
}

/** Validate a `move_and_wait`: turn preconditions, unit ownership/state, path (§10). */
function validateMoveAndWait(
  state: MatchState,
  action: MoveAndWaitAction,
  gameData: GameData,
): ValidationResult {
  const errors = turnPreconditions(state, action);

  const unit = unitById(state, action.unitId);
  if (unit === undefined) {
    errors.push({ code: "invalid_unit" });
    return result(errors); // no unit → nothing further to check
  }
  if (unit.ownerPlayerId !== action.playerId) {
    errors.push({ code: "unit_not_owned" });
  }
  if (unit.hasActed) {
    errors.push({ code: "unit_already_acted" });
  }

  // Under fog the mover cannot see hidden enemies, so they do not block the
  // submitted path — the collision is resolved when the move is applied (§18.5).
  const visibleTiles = state.match.fogEnabled
    ? new Set(
        calculateVisibility(state, action.playerId, gameData).visible.map(
          (c) => `${c.x},${c.y}`,
        ),
      )
    : undefined;
  const path = validateMovementPath(
    state,
    action.unitId,
    action.path,
    gameData,
    visibleTiles,
  );
  if (!path.valid) errors.push(...path.errors);

  return result(errors);
}

/**
 * Validate whether `action` is legal against `state` (M2 scope: `move_and_wait`
 * and `end_turn`).
 */
export function validateAction(
  state: MatchState,
  action: Action,
  gameData: GameData,
): ValidationResult {
  switch (action.type) {
    case "move_and_wait":
      return validateMoveAndWait(state, action, gameData);
    case "attack":
      return validateAttack(state, action, gameData);
    case "capture":
      return validateCapture(state, action, gameData);
    case "produce":
      return validateProduce(state, action, gameData);
    case "supply":
      return validateSupply(state, action, gameData);
    case "join":
      return validateJoin(state, action, gameData);
    case "load":
      return validateLoad(state, action, gameData);
    case "unload":
      return validateUnload(state, action, gameData);
    case "dive":
      return validateDive(state, action, gameData);
    case "surface":
      return validateSurface(state, action, gameData);
    case "activate_power":
      return validateActivatePower(state, action, gameData);
    case "end_turn":
    case "resign":
      // Always legal for the active player of an active match.
      return result(turnPreconditions(state, action));
    case "claim_victory":
      // Inverted: the claimant is the INACTIVE opponent of an active match. The
      // deadline-expired / no-late-action gates are the backend's (clock-owned).
      return result(claimPreconditions(state, action));
    default:
      return {
        valid: false,
        errors: [
          {
            code: "invalid_action_type",
            message: `"${action.type}" is not resolvable in M2`,
          },
        ],
      };
  }
}
