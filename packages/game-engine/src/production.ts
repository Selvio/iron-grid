/**
 * Unit production: the `produce` action at an owned production property
 * (`game-specification.md` §6.4; `rules.yaml` → `production_rules`).
 *
 * Production is legal only on an owned, empty base/airport/port whose category
 * allows the requested unit, when the enabled unit's cost fits the owner's funds.
 * On success the cost is deducted atomically (never negative, §6.5), a full-state
 * unit is placed on the property already `has_acted` (it cannot act until the
 * owner's next turn, §6.4), and a `unit_produced` event is emitted. Costs and
 * created state come from `units.yaml`; the client never supplies them. Draws no
 * randomness; the new unit's id is server-assigned via the action.
 *
 * @see docs/02-data/rules.yaml → production_rules
 * @see docs/01-specification/game-specification.md §6.4, §6.5
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T3)
 */

import type { GameData } from "game-data";

import type { ProduceAction } from "./actions";
import {
  addUnit,
  playerById,
  propertyById,
  unitAt,
  updatePlayer,
} from "./board";
import type { EngineResult, ValidationError, ValidationResult } from "./engine";
import type { Event } from "./events";
import type {
  MatchState,
  PlayerState,
  PropertyState,
  UnitState,
} from "./state";

/**
 * The unit type ids `player` may build **now** at their `property` — the roster +
 * occupancy + affordability core of `validateProduce`, minus the envelope /
 * server-assigned `newUnitId`. Returns `[]` when the property is not the player's,
 * does not produce, is occupied, or nothing enabled is affordable. Pure; used to
 * enumerate `produce` legal actions (§6.4) and to drive the build menu.
 */
export function producibleUnitsAt(
  state: MatchState,
  gameData: GameData,
  property: PropertyState,
  player: PlayerState,
): readonly string[] {
  if (property.ownerPlayerId !== player.playerId) return [];
  const production = gameData.properties[property.typeId]?.production;
  if (production === undefined || production.category === "none") return [];
  // The property tile must be empty to place a produced unit (§6.4).
  if (unitAt(state, property.position) !== undefined) return [];
  return production.allowed_unit_ids.filter((unitTypeId) => {
    const unitDef = gameData.units[unitTypeId];
    return (
      unitDef !== undefined &&
      unitDef.enabled_in_mvp &&
      player.funds >= unitDef.cost
    );
  });
}

/** Validate a `produce` (turn/ownership, category, roster, occupancy, funds; §6.4). */
export function validateProduce(
  state: MatchState,
  action: ProduceAction,
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

  const property = propertyById(state, action.propertyId);
  if (property === undefined || property.ownerPlayerId !== action.playerId) {
    errors.push({ code: "invalid_production" });
    return done();
  }

  const propDef = gameData.properties[property.typeId];
  const unitDef = gameData.units[action.unitTypeId];
  if (
    propDef === undefined ||
    propDef.production.category === "none" ||
    !propDef.production.allowed_unit_ids.includes(action.unitTypeId) ||
    unitDef === undefined ||
    !unitDef.enabled_in_mvp
  ) {
    errors.push({ code: "invalid_production" });
    return done();
  }

  // The property tile must be empty (§6.4).
  if (unitAt(state, property.position) !== undefined) {
    errors.push({ code: "invalid_production" });
  }

  // Sufficient funds (§6.4, §6.5).
  const player = playerById(state, action.playerId);
  if (player !== undefined && player.funds < unitDef.cost) {
    errors.push({ code: "insufficient_funds" });
  }

  return done();
}

/**
 * Apply a validated `produce`: deduct the cost and place a full-state, already-
 * acted unit on the property tile.
 */
export function applyProduce(
  state: MatchState,
  action: ProduceAction,
  gameData: GameData,
): EngineResult {
  const property = propertyById(state, action.propertyId)!;
  const unitDef = gameData.units[action.unitTypeId]!;
  const player = playerById(state, action.playerId)!;

  const fundsAfter = player.funds - unitDef.cost;
  let next = updatePlayer(state, action.playerId, { funds: fundsAfter });

  const produced: UnitState = {
    id: action.newUnitId,
    typeId: action.unitTypeId,
    ownerPlayerId: action.playerId,
    position: property.position,
    trueHp: unitDef.max_true_hp,
    fuel: unitDef.logistics.max_fuel,
    ammo: unitDef.logistics.max_ammo ?? 0,
    hasActed: true, // cannot act until the owner's next turn (§6.4)
    captureTargetPropertyId: null,
    cargoUnitIds: [],
    specialState: unitDef.special_states.length > 0 ? "surfaced" : null,
    createdTurn: state.match.currentDay,
  };
  next = addUnit(next, produced);

  const events: Event[] = [
    {
      type: "unit_produced",
      unitId: produced.id,
      unitTypeId: action.unitTypeId,
      propertyId: property.id,
      ownerPlayerId: action.playerId,
      fundsAfter,
    },
  ];
  return { nextState: next, events };
}
