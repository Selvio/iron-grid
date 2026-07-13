/**
 * The APC `supply` action: refill adjacent allied units' fuel and primary ammo
 * (§14.5; `rules.yaml` → `supply_rules`).
 *
 * Supply is a capability-gated action (`units.yaml` capabilities.can_supply): the
 * supplier may move first, then every orthogonally adjacent same-owner unit is
 * refilled to maximum fuel and ammo — no HP repair — and the supplier's
 * activation ends. Draws no randomness.
 *
 * @see docs/02-data/rules.yaml → supply_rules
 * @see docs/01-specification/game-specification.md §14.5
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T4)
 */

import type { GameData } from "game-data";

import type { SupplyAction } from "./actions";
import { compareBoardOrder, replaceUnit, unitById } from "./board";
import type { EngineResult, ValidationError, ValidationResult } from "./engine";
import type { Event } from "./events";
import { validateMovementPath } from "./movement";
import { resuppliedUnit } from "./repair";
import type { Coordinate, MatchState, UnitState } from "./state";

/** The supply tile — the path end, or the unit's own tile. */
function supplyTile(unit: UnitState, path: SupplyAction["path"]): Coordinate {
  if (path !== undefined && path.length > 0) return path[path.length - 1]!;
  return unit.position ?? { x: -1, y: -1 };
}

/** Same-owner board units orthogonally adjacent to `from` (excluding the supplier). */
function adjacentAllies(
  state: MatchState,
  from: Coordinate,
  supplierId: string,
  ownerId: string,
): UnitState[] {
  return state.units
    .filter(
      (u) =>
        u.id !== supplierId &&
        u.ownerPlayerId === ownerId &&
        u.position !== null &&
        Math.abs(u.position.x - from.x) + Math.abs(u.position.y - from.y) === 1,
    )
    .slice()
    .sort(compareBoardOrder);
}

/** Validate a `supply` (turn/ownership, capability, optional move, targets; §14.5). */
export function validateSupply(
  state: MatchState,
  action: SupplyAction,
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
  if (def === undefined || !def.capabilities.can_supply) {
    errors.push({ code: "invalid_supply" });
    return done();
  }

  const path = action.path;
  if (path !== undefined && path.length > 1) {
    const move = validateMovementPath(state, action.unitId, path, gameData);
    if (!move.valid) errors.push(...move.errors);
  }

  const from = supplyTile(unit, path);
  if (adjacentAllies(state, from, unit.id, unit.ownerPlayerId).length === 0) {
    errors.push({ code: "invalid_supply" }); // nothing to resupply
  }

  return done();
}

/** Apply a validated `supply`: optional move, then refill every adjacent ally. */
export function applySupply(
  state: MatchState,
  action: SupplyAction,
  gameData: GameData,
): EngineResult {
  const supplier0 = unitById(state, action.unitId)!;
  const path = action.path;
  const moving = path !== undefined && path.length > 1;
  const from = supplyTile(supplier0, path);
  const fuelSpent = moving ? path.length - 1 : 0;

  const events: Event[] = [];
  const supplier: UnitState = {
    ...supplier0,
    position: from,
    fuel: supplier0.fuel - fuelSpent,
    hasActed: true,
  };
  let next = replaceUnit(state, supplier);
  if (moving) {
    events.push({
      type: "unit_moved",
      unitId: supplier0.id,
      path,
      fuelSpent,
      fuelAfter: supplier.fuel,
    });
  }

  for (const ally of adjacentAllies(
    next,
    from,
    supplier0.id,
    supplier0.ownerPlayerId,
  )) {
    const allyDef = gameData.units[ally.typeId];
    if (allyDef === undefined) continue;
    const refilled = resuppliedUnit(ally, allyDef);
    next = replaceUnit(next, refilled);
    events.push({
      type: "unit_supplied",
      supplierUnitId: supplier0.id,
      unitId: ally.id,
      fuelAfter: refilled.fuel,
      ammoAfter: refilled.ammo,
    });
  }

  return { nextState: next, events };
}
