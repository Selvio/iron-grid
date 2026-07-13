/**
 * Submarine dive/surface (§19.2; `rules.yaml` → `submarine_rules`).
 *
 * Dive and surface are explicit, capability-gated actions (`units.yaml`
 * capabilities.can_dive) that flip the unit's `specialState` and consume its
 * activation. The per-state daily fuel already burns in `resolveStartOfTurn`
 * (M2), and the visibility recalculation these trigger lands with fog in M3-T6.
 * Draws no randomness.
 *
 * @see docs/02-data/rules.yaml → submarine_rules
 * @see docs/01-specification/game-specification.md §19
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T5)
 */

import type { GameData } from "game-data";

import type { DiveAction, SurfaceAction } from "./actions";
import { replaceUnit, unitById } from "./board";
import type { EngineResult, ValidationError, ValidationResult } from "./engine";
import type { Event } from "./events";
import type { MatchState, SpecialState } from "./state";

/** Validate a state change to `target` for the diver `unitId` (§19.2). */
function validateStateChange(
  state: MatchState,
  playerId: string,
  unitId: string,
  target: SpecialState,
  gameData: GameData,
): ValidationResult {
  const errors: ValidationError[] = [];
  const done = (): ValidationResult =>
    errors.length === 0 ? { valid: true } : { valid: false, errors };

  if (state.match.status !== "active")
    errors.push({ code: "match_not_active" });
  if (playerId !== state.match.activePlayerId) {
    errors.push({ code: "not_active_player" });
  }

  const unit = unitById(state, unitId);
  if (unit === undefined || unit.position === null) {
    errors.push({ code: "invalid_unit" });
    return done();
  }
  if (unit.ownerPlayerId !== playerId) errors.push({ code: "unit_not_owned" });
  if (unit.hasActed) errors.push({ code: "unit_already_acted" });

  const def = gameData.units[unit.typeId];
  if (def === undefined || !def.capabilities.can_dive) {
    errors.push({ code: "invalid_special_state" });
    return done();
  }
  // Already in the target state → the action is a no-op and illegal.
  if (unit.specialState === target) {
    errors.push({ code: "invalid_special_state" });
  }

  return done();
}

/** Validate a `dive` (§19.2). */
export function validateDive(
  state: MatchState,
  action: DiveAction,
  gameData: GameData,
): ValidationResult {
  return validateStateChange(
    state,
    action.playerId,
    action.unitId,
    "submerged",
    gameData,
  );
}

/** Validate a `surface` (§19.2). */
export function validateSurface(
  state: MatchState,
  action: SurfaceAction,
  gameData: GameData,
): ValidationResult {
  return validateStateChange(
    state,
    action.playerId,
    action.unitId,
    "surfaced",
    gameData,
  );
}

/** Apply a validated dive/surface: flip the state and end the activation. */
function applyStateChange(
  state: MatchState,
  unitId: string,
  target: SpecialState,
): EngineResult {
  const unit = unitById(state, unitId)!;
  const nextState = replaceUnit(state, {
    ...unit,
    specialState: target,
    hasActed: true,
  });
  const events: Event[] = [
    {
      type: target === "submerged" ? "submarine_dived" : "submarine_surfaced",
      unitId,
    },
  ];
  return { nextState, events };
}

/** Apply a validated `dive`. */
export function applyDive(state: MatchState, action: DiveAction): EngineResult {
  return applyStateChange(state, action.unitId, "submerged");
}

/** Apply a validated `surface`. */
export function applySurface(
  state: MatchState,
  action: SurfaceAction,
): EngineResult {
  return applyStateChange(state, action.unitId, "surfaced");
}
