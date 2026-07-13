/**
 * Capture resolution: the `capture` action plus the continuity reset that fires
 * when a capturing unit does anything else (`game-specification.md` §13;
 * `rules.yaml` → `capture_rules`).
 *
 * A capture subtracts the capturing unit's **displayed** HP from the property's
 * remaining points (start 20, §13.3); progress persists only while the same
 * living unit keeps capturing on later owner turns (§13.4), so any other action —
 * a move, an attack, or destruction — resets the property to full. At zero points
 * ownership flips immediately and the points reset (§13.5); capturing an HQ is
 * the victory signal M3-T7 consumes. Draws no randomness.
 *
 * @see docs/02-data/rules.yaml → capture_rules
 * @see docs/01-specification/game-specification.md §13
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T2)
 */

import type { GameData } from "game-data";

import type { CaptureAction } from "./actions";
import {
  displayHp,
  propertyAt,
  propertyById,
  replaceProperty,
  replaceUnit,
  unitById,
} from "./board";
import type { EngineResult, ValidationError, ValidationResult } from "./engine";
import type { Event } from "./events";
import { validateMovementPath } from "./movement";
import type { Coordinate, Id, MatchState, UnitState } from "./state";

/** Fallback capture maximum when a property type is somehow absent (§13.3). */
const DEFAULT_MAX_POINTS = 20;

/** The tile the unit captures from — the path end, or its own tile. */
function captureTile(unit: UnitState, path: CaptureAction["path"]): Coordinate {
  if (path !== undefined && path.length > 0) return path[path.length - 1]!;
  return unit.position ?? { x: -1, y: -1 };
}

/** A property's configured maximum capture points, defaulting to 20. */
function maxPointsFor(gameData: GameData, typeId: string): number {
  return gameData.properties[typeId]?.max_capture_points ?? DEFAULT_MAX_POINTS;
}

/**
 * Reset any capture `unitId` was performing, except on `keepPropertyId` (§13.4).
 * Called whenever the unit takes a non-continuing action — move, attack — so the
 * property returns to full points and forgets the unit.
 */
export function clearCaptureBy(
  state: MatchState,
  unitId: Id,
  gameData: GameData,
  keepPropertyId: Id | null = null,
): MatchState {
  const unit = unitById(state, unitId);
  if (unit === undefined || unit.captureTargetPropertyId === null) return state;
  if (unit.captureTargetPropertyId === keepPropertyId) return state;

  const propertyId = unit.captureTargetPropertyId;
  let next = replaceUnit(state, { ...unit, captureTargetPropertyId: null });
  const property = propertyById(next, propertyId);
  if (property !== undefined && property.capturingUnitId === unitId) {
    next = replaceProperty(next, {
      ...property,
      capturingUnitId: null,
      capturePointsRemaining: maxPointsFor(gameData, property.typeId),
    });
  }
  return next;
}

/** Validate a `capture` (turn/ownership, capability, optional move, target; §13). */
export function validateCapture(
  state: MatchState,
  action: CaptureAction,
  gameData: GameData,
): ValidationResult {
  const errors: ValidationError[] = [];
  const done = (): ValidationResult =>
    errors.length === 0 ? { valid: true } : { valid: false, errors };

  if (state.match.status !== "active")
    errors.push({ code: "match_not_active" });
  if (action.playerId !== state.match.activePlayerId) {
    errors.push({ code: "not_active_player" });
  }

  const unit = unitById(state, action.unitId);
  if (unit === undefined || unit.position === null) {
    errors.push({ code: "invalid_unit" });
    return done();
  }
  if (unit.ownerPlayerId !== action.playerId) {
    errors.push({ code: "unit_not_owned" });
  }
  if (unit.hasActed) errors.push({ code: "unit_already_acted" });

  const def = gameData.units[unit.typeId];
  if (def === undefined) {
    errors.push({ code: "invalid_unit" });
    return done();
  }
  if (!def.capabilities.can_capture) errors.push({ code: "invalid_capture" });

  const path = action.path;
  if (path !== undefined && path.length > 1) {
    if (!def.movement.can_move_and_capture) {
      errors.push({ code: "invalid_capture" });
    }
    const move = validateMovementPath(state, action.unitId, path, gameData);
    if (!move.valid) errors.push(...move.errors);
  }

  const property = propertyAt(state, captureTile(unit, path));
  const propDef =
    property === undefined ? undefined : gameData.properties[property.typeId];
  if (
    property === undefined ||
    propDef === undefined ||
    !propDef.capturable ||
    property.ownerPlayerId === unit.ownerPlayerId
  ) {
    errors.push({ code: "invalid_capture" });
  }

  return done();
}

/**
 * Apply a validated `capture`: optional move onto the property, subtract the
 * unit's displayed HP from the (fresh-or-continuing) points, and either progress
 * or complete the capture — flipping ownership and resetting points at zero.
 */
export function applyCapture(
  state: MatchState,
  action: CaptureAction,
  gameData: GameData,
): EngineResult {
  const unit0 = unitById(state, action.unitId)!;
  const path = action.path;
  const moving = path !== undefined && path.length > 1;
  const capturePos = captureTile(unit0, path);
  const fuelSpent = moving ? path.length - 1 : 0;
  const property = propertyAt(state, capturePos)!;
  const maxPoints = maxPointsFor(gameData, property.typeId);

  const events: Event[] = [];

  // Reset any capture this unit was doing on a *different* property (§13.4),
  // then apply the move component onto the target tile.
  let next = clearCaptureBy(state, unit0.id, gameData, property.id);
  const movedUnit: UnitState = {
    ...unit0,
    position: capturePos,
    fuel: unit0.fuel - fuelSpent,
  };
  if (moving) {
    events.push({
      type: "unit_moved",
      unitId: unit0.id,
      path,
      fuelSpent,
      fuelAfter: movedUnit.fuel,
    });
  }

  // Fresh capture (a new unit) restarts at full points (§13.4); a continuing
  // unit picks up where it left off. Subtract this unit's displayed HP (§13.3).
  const fresh = property.capturingUnitId !== unit0.id;
  if (fresh) {
    events.push({
      type: "capture_started",
      unitId: unit0.id,
      propertyId: property.id,
    });
  }
  const startPoints = fresh ? maxPoints : property.capturePointsRemaining;
  const remaining = startPoints - displayHp(unit0.trueHp);

  if (remaining > 0) {
    next = replaceProperty(next, {
      ...property,
      capturePointsRemaining: remaining,
      capturingUnitId: unit0.id,
    });
    next = replaceUnit(next, {
      ...movedUnit,
      captureTargetPropertyId: property.id,
      hasActed: true,
    });
    events.push({
      type: "capture_progressed",
      unitId: unit0.id,
      propertyId: property.id,
      pointsRemaining: remaining,
    });
  } else {
    // Completion (§13.5): ownership flips immediately, points reset to full.
    next = replaceProperty(next, {
      ...property,
      ownerPlayerId: unit0.ownerPlayerId,
      capturePointsRemaining: maxPoints,
      capturingUnitId: null,
    });
    next = replaceUnit(next, {
      ...movedUnit,
      captureTargetPropertyId: null,
      hasActed: true,
    });
    events.push({
      type: "property_captured",
      unitId: unit0.id,
      propertyId: property.id,
      newOwnerPlayerId: unit0.ownerPlayerId,
    });
  }

  return { nextState: next, events };
}
