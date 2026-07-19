/**
 * The `join` action: merge a moving unit into a friendly same-type unit it moves
 * onto (§15; `rules.yaml` → `join_rules`).
 *
 * The moving unit reaches the destination (the normal move rules, except ending
 * on the friendly target is allowed here), then is absorbed: true HP, fuel and
 * ammo combine up to their maxima, HP beyond full is refunded as
 * `floor(unitCost × excessTrueHp / 100)` (§15.3), the surviving destination unit
 * is marked acted, and the source is removed — one `units_joined` event records
 * it. Nested-cargo joins are forbidden. Draws no randomness.
 *
 * @see docs/02-data/rules.yaml → join_rules
 * @see docs/01-specification/game-specification.md §15
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T4)
 */

import type { GameData } from "game-data";

import type { JoinAction } from "./actions";
import {
  removeUnit,
  replaceUnit,
  unitAt,
  unitById,
  updatePlayer,
} from "./board";
import { clearCaptureBy } from "./capture";
import type { EngineResult, ValidationError, ValidationResult } from "./engine";
import type { Event } from "./events";
import { validateMovementPath } from "./movement";
import type { Coordinate, MatchState, UnitState } from "./state";

/** The destination tile — the path end. */
function destinationOf(path: readonly Coordinate[]): Coordinate | undefined {
  return path[path.length - 1];
}

/** Validate a `join` (turn/ownership, capability, path, same-type target; §15.1). */
export function validateJoin(
  state: MatchState,
  action: JoinAction,
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

  const source = unitById(state, action.unitId);
  if (source === undefined || source.position === null) {
    errors.push({ code: "invalid_unit" });
    return done();
  }
  if (source.ownerPlayerId !== action.playerId) {
    errors.push({ code: "unit_not_owned" });
  }
  if (source.hasActed) errors.push({ code: "unit_already_acted" });

  const def = gameData.units[source.typeId];
  const destination = destinationOf(action.path);
  if (
    def === undefined ||
    destination === undefined ||
    action.path.length < 2
  ) {
    errors.push({ code: "invalid_join" });
    return done();
  }
  if (!def.movement.can_move_and_join || source.cargoUnitIds.length > 0) {
    errors.push({ code: "invalid_join" });
  }

  // The path must be legal up to the destination; ending on the friendly target
  // is the join exception, so ignore only the destination-occupied rejection.
  const move = validateMovementPath(
    state,
    action.unitId,
    action.path,
    gameData,
  );
  errors.push(...move.errors.filter((e) => e.code !== "destination_occupied"));

  const target = unitAt(state, destination);
  if (
    target === undefined ||
    target.id === source.id ||
    target.ownerPlayerId !== source.ownerPlayerId ||
    target.typeId !== source.typeId ||
    target.cargoUnitIds.length > 0
  ) {
    errors.push({ code: "invalid_join" });
  }

  return done();
}

/**
 * Whether `source` could legally join the unit occupying `tile` — the capability
 * + same-type-target core of `validateJoin`, minus the move-path legality the
 * caller establishes (`tile` is a proven-reachable friendly tile). Pure; used to
 * enumerate `join` legal actions (§15.1).
 */
export function joinTargetAt(
  state: MatchState,
  source: UnitState,
  def: GameData["units"][string],
  tile: Coordinate,
): boolean {
  if (!def.movement?.can_move_and_join || source.cargoUnitIds.length > 0) {
    return false;
  }
  const target = unitAt(state, tile);
  return (
    target !== undefined &&
    target.id !== source.id &&
    target.ownerPlayerId === source.ownerPlayerId &&
    target.typeId === source.typeId &&
    target.cargoUnitIds.length === 0
  );
}

/**
 * Apply a validated `join`: combine HP/fuel/ammo into the destination (up to the
 * maxima), refund excess HP, mark it acted, and remove the source.
 */
export function applyJoin(
  state: MatchState,
  action: JoinAction,
  gameData: GameData,
): EngineResult {
  const source = unitById(state, action.unitId)!;
  const destination = destinationOf(action.path)!;
  const target = unitAt(state, destination)!;
  const def = gameData.units[source.typeId]!;

  const fuelSpent = action.path.length - 1;
  const movedFuel = source.fuel - fuelSpent;

  const combinedTrueHp = source.trueHp + target.trueHp;
  const trueHpAfter = Math.min(def.max_true_hp, combinedTrueHp);
  const excess = Math.max(0, combinedTrueHp - def.max_true_hp);
  const refund = Math.floor((def.cost * excess) / 100); // §15.3

  const fuelAfter = Math.min(def.logistics.max_fuel, movedFuel + target.fuel);
  const ammoAfter =
    def.logistics.max_ammo === null
      ? target.ammo
      : Math.min(def.logistics.max_ammo, source.ammo + target.ammo);

  const merged: UnitState = {
    ...target,
    trueHp: trueHpAfter,
    fuel: fuelAfter,
    ammo: ammoAfter,
    hasActed: true,
  };

  // Absorbing the source ends any capture it was performing (§13.4).
  let next = clearCaptureBy(state, source.id, gameData);
  next = removeUnit(next, source.id);
  next = replaceUnit(next, merged);
  if (refund > 0) {
    const funds =
      (next.players.find((p) => p.playerId === source.ownerPlayerId)?.funds ??
        0) + refund;
    next = updatePlayer(next, source.ownerPlayerId, { funds });
  }

  const events: Event[] = [
    {
      type: "units_joined",
      survivingUnitId: target.id,
      absorbedUnitId: source.id,
      trueHpAfter,
      fuelAfter,
      ammoAfter,
      refund,
    },
  ];
  return { nextState: next, events };
}
