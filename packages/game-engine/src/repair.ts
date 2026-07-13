/**
 * Start-of-turn repair and resupply on owned compatible properties (§14.1–§14.4;
 * `rules.yaml` → `income_repair_resupply_rules`). These fill the two ordered
 * `resolveStartOfTurn` hooks M2 left as no-ops, between income and daily fuel.
 *
 * A unit on an owned property whose repair categories include its category
 * restores up to 2 displayed HP, paying `floor(unitCost × 10%)` per displayed HP
 * — partially when funds are short, in whole steps, never going negative (§14.3–
 * §14.4) — and then has its fuel and primary ammo refilled for free, even at zero
 * funds (§14.1, resupply). Both passes draw no randomness and process the active
 * player's board units in canonical order for deterministic events.
 *
 * @see docs/02-data/rules.yaml → income_repair_resupply_rules
 * @see docs/01-specification/game-specification.md §14
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T4)
 */

import type { GameData } from "game-data";

import {
  compareBoardOrder,
  displayHp,
  playerById,
  propertyAt,
  replaceUnit,
  unitById,
  updatePlayer,
} from "./board";
import type { Event } from "./events";
import type { Id, MatchState, UnitState } from "./state";

type UnitDef = GameData["units"][string];

/** Max displayed HP a unit may repair per turn (§14.1). */
const MAX_REPAIR_STEPS = 2;

/**
 * Whether `unit` sits on a property its owner holds and whose repair categories
 * include the unit's category (§14.1–§14.2). Returns the unit definition too.
 */
function serviceable(
  state: MatchState,
  gameData: GameData,
  unit: UnitState,
): UnitDef | null {
  if (unit.position === null) return null;
  const property = propertyAt(state, unit.position);
  if (property === undefined || property.ownerPlayerId !== unit.ownerPlayerId) {
    return null;
  }
  const propDef = gameData.properties[property.typeId];
  const unitDef = gameData.units[unit.typeId];
  if (propDef === undefined || unitDef === undefined) return null;
  const categories = propDef.repair?.categories;
  if (!Array.isArray(categories)) return null; // non-repairing property
  return categories.includes(unitDef.category) ? unitDef : null;
}

/** The active player's board units, in canonical order. */
function activeBoardUnits(state: MatchState, activeId: Id): UnitState[] {
  return state.units
    .filter((u) => u.ownerPlayerId === activeId && u.position !== null)
    .slice()
    .sort(compareBoardOrder);
}

/**
 * Repair eligible units up to 2 displayed HP, paying per displayed HP and
 * stopping at whatever the owner can afford (§14.3–§14.4).
 */
export function repairUnits(
  state: MatchState,
  gameData: GameData,
  activeId: Id,
): { readonly state: MatchState; readonly events: Event[] } {
  const events: Event[] = [];
  let next = state;

  for (const unit of activeBoardUnits(state, activeId)) {
    const unitDef = serviceable(next, gameData, unit);
    if (unitDef === null) continue;

    const current = displayHp(unit.trueHp);
    const room = displayHp(unitDef.max_true_hp) - current;
    const possible = Math.min(MAX_REPAIR_STEPS, room);
    if (possible <= 0) continue;

    const costPerStep = Math.floor(unitDef.cost / 10); // cost × 10% (§14.3)
    const funds = playerById(next, activeId)?.funds ?? 0;
    const affordable =
      costPerStep > 0 ? Math.floor(funds / costPerStep) : possible;
    const steps = Math.min(possible, affordable);
    if (steps <= 0) continue;

    const cost = steps * costPerStep;
    const trueHpAfter = Math.min(unitDef.max_true_hp, unit.trueHp + steps * 10);
    next = replaceUnit(next, { ...unit, trueHp: trueHpAfter });
    next = updatePlayer(next, activeId, { funds: funds - cost });
    events.push({
      type: "unit_repaired",
      unitId: unit.id,
      displayedHpRepaired: steps,
      trueHpAfter,
      cost,
    });
  }

  return { state: next, events };
}

/** Refill a unit's fuel and primary ammo to maximum (`units.yaml` logistics). */
export function resuppliedUnit(unit: UnitState, def: UnitDef): UnitState {
  return {
    ...unit,
    fuel: def.logistics.max_fuel,
    ammo: def.logistics.max_ammo ?? unit.ammo,
  };
}

/**
 * Refill fuel and primary ammo to maximum for eligible units — free, and
 * independent of repair or funds (§14.1). Runs after {@link repairUnits}.
 */
export function resupplyUnits(
  state: MatchState,
  gameData: GameData,
  activeId: Id,
): { readonly state: MatchState; readonly events: Event[] } {
  const events: Event[] = [];
  let next = state;

  for (const snapshot of activeBoardUnits(state, activeId)) {
    const unitDef = serviceable(next, gameData, snapshot);
    if (unitDef === null) continue;

    // Read the post-repair unit so a fresh repair's HP is preserved.
    const unit = unitById(next, snapshot.id);
    if (unit === undefined) continue;
    const refilled = resuppliedUnit(unit, unitDef);
    if (refilled.fuel === unit.fuel && refilled.ammo === unit.ammo) continue;

    next = replaceUnit(next, refilled);
    events.push({
      type: "unit_resupplied",
      unitId: unit.id,
      fuelAfter: refilled.fuel,
      ammoAfter: refilled.ammo,
    });
  }

  return { state: next, events };
}
