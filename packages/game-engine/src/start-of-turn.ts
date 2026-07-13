/**
 * `resolveStartOfTurn` — the deterministic start-of-turn transaction
 * (`game-specification.md` §5, `rules.yaml` → `turn_sequence.start_of_turn`).
 *
 * The function runs the canonical ordered step list exactly once for the match's
 * active player and returns `{ nextState, events }`. It is pure: it draws no
 * randomness, reads no wall clock, performs no I/O, and never mutates its input
 * — every change is a new `MatchState` via the structural-sharing board helpers.
 *
 * M2 fills the steps in scope (income §6.2, daily fuel §17.2–§17.3, action-flag
 * reset) and leaves the M3 steps — repair/resupply, commander power, visibility
 * and victory — as ordered **no-op hooks** so M3 fills them in place without
 * reordering the transaction.
 *
 * Wall-clock values are injected, never read (§3, `domain-model.md` §15): the
 * function signals a fresh turn by clearing `turnDeadlineAt` and emitting
 * `turn_started`; the backend stamps the actual deadline instant.
 *
 * @see docs/02-data/rules.yaml → turn_sequence.start_of_turn
 * @see docs/01-specification/game-specification.md §5, §6, §17
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T2)
 */

import type { GameData } from "game-data";

import {
  compareBoardOrder,
  playerById,
  removeUnit,
  replaceUnit,
  unitById,
  updateMatch,
  updatePlayer,
} from "./board";
import type { EngineResult } from "./engine";
import type { Event } from "./events";
import type { Id, MatchState, SpecialState, UnitState } from "./state";

/** A validated unit definition, resolved from `GameData` by `typeId`. */
type UnitDef = GameData["units"][string];

/**
 * The daily fuel a unit burns at start of its owner's turn (§17.2). Divers burn
 * a per-state amount (`units.yaml` logistics.daily_fuel); every other unit burns
 * its single `default` (0 for ground units, which therefore never pay).
 */
function dailyFuelBurn(
  def: UnitDef,
  specialState: SpecialState | null,
): number {
  const df = def.logistics.daily_fuel;
  if ("surfaced" in df) {
    return specialState === "submerged" ? df.submerged : df.surfaced;
  }
  return df.default;
}

/**
 * Whether a unit that cannot pay its daily fuel is destroyed (§17.3). Air and
 * naval units are destroyed; ground units survive at zero fuel. Category-driven,
 * never keyed off unit ids, so the rule holds for any future roster.
 */
function destroyedOnUnpaidFuel(def: UnitDef): boolean {
  return def.category === "air" || def.category === "naval";
}

// --- M3 ordered hooks -------------------------------------------------------
// Present and ordered so M3 fills each step in place without reordering the
// transaction. Each is currently the identity on state and emits no events.

/** M3 step: repair units on owned compatible properties (§5.4, §6). No-op in M2. */
function repairUnitsHook(state: MatchState): MatchState {
  return state;
}

/** M3 step: resupply units on owned compatible properties (§5.4). No-op in M2. */
function resupplyUnitsHook(state: MatchState): MatchState {
  return state;
}

/** M3 step: reset/update temporary commander-power state (§5.8, §22). No-op in M2. */
function commanderPowerHook(state: MatchState): MatchState {
  return state;
}

/** M3 step: recalculate per-player visibility (§5.9, §18). No-op in M2. */
function recalculateVisibilityHook(state: MatchState): MatchState {
  return state;
}

/** M3 step: evaluate defeat/victory conditions (§5.10, §23). No-op in M2. */
function evaluateVictoryHook(state: MatchState): MatchState {
  return state;
}

/**
 * Run the deterministic start-of-turn transaction for the match's active player.
 *
 * @throws {Error} if the match is not active or its active player is unknown —
 *   an invariant violation, since this function is invoked by the engine's own
 *   turn flow (match activation, `end_turn`), never straight from client input.
 */
export function resolveStartOfTurn(
  state: MatchState,
  gameData: GameData,
): EngineResult {
  const events: Event[] = [];
  const activeId = state.match.activePlayerId;

  // 1. verify_match_and_active_player
  if (state.match.status !== "active") {
    throw new Error(
      `resolveStartOfTurn: match ${state.match.id} is not active (${state.match.status})`,
    );
  }
  const activePlayer = playerById(state, activeId);
  if (activePlayer === undefined) {
    throw new Error(
      `resolveStartOfTurn: active player ${activeId} is not a match player`,
    );
  }

  let next = state;

  // 2. advance_turn_and_day_counters (§ day_definition: the day advances each
  //    time the turn returns to the first player; match activation starts the
  //    counter one below the opening day so the first turn lands on it).
  const day =
    activeId === state.match.firstPlayerId
      ? state.match.currentDay + 1
      : state.match.currentDay;
  next = updateMatch(next, { currentDay: day });

  // 3. grant_property_income (§6.2): 1,000 per owned income-producing property,
  //    read from `properties.yaml` economy so silos/terrain grant nothing unless
  //    configured. Aggregated into one credit so `fundsAfter` is unambiguous.
  const income = next.properties
    .filter((p) => p.ownerPlayerId === activeId)
    .reduce(
      (sum, p) =>
        sum + (gameData.properties[p.typeId]?.economy.income_per_turn ?? 0),
      0,
    );
  if (income > 0) {
    const fundsAfter = activePlayer.funds + income;
    next = updatePlayer(next, activeId, { funds: fundsAfter });
    events.push({
      type: "income_granted",
      playerId: activeId,
      amount: income,
      fundsAfter,
    });
  }

  // 4–5. repair / resupply (M3 no-op hooks, ordered before fuel consumption).
  next = repairUnitsHook(next);
  next = resupplyUnitsHook(next);

  // The active player's units, in canonical board order, drive the remaining
  // per-unit steps so fuel/destroy/reset events replay deterministically.
  const activeUnits = next.units
    .filter((u) => u.ownerPlayerId === activeId)
    .slice()
    .sort(compareBoardOrder);

  // 6. consume_daily_fuel (§17.2). A unit that cannot pay is not debited here;
  //    it is handled in the destroy step so its state stays consistent.
  const unpayable = new Set<Id>();
  for (const u of activeUnits) {
    const def = gameData.units[u.typeId];
    if (def === undefined) {
      throw new Error(
        `resolveStartOfTurn: unit ${u.id} has unknown type "${u.typeId}"`,
      );
    }
    const burn = dailyFuelBurn(def, u.specialState);
    if (burn <= 0) continue;
    if (u.fuel >= burn) {
      const fuelAfter = u.fuel - burn;
      next = replaceUnit(next, { ...u, fuel: fuelAfter });
      events.push({
        type: "fuel_consumed",
        unitId: u.id,
        amount: burn,
        fuelAfter,
      });
    } else if (destroyedOnUnpaidFuel(def)) {
      unpayable.add(u.id);
    } else if (u.fuel !== 0) {
      // Ground unit that cannot pay survives at zero fuel (§17.3).
      next = replaceUnit(next, { ...u, fuel: 0 });
      events.push({
        type: "fuel_consumed",
        unitId: u.id,
        amount: u.fuel,
        fuelAfter: 0,
      });
    }
  }

  // 7. destroy_units_unable_to_pay_daily_fuel (§17.3): air/naval only.
  for (const u of activeUnits) {
    if (!unpayable.has(u.id)) continue;
    next = removeUnit(next, u.id);
    events.push({ type: "unit_destroyed", unitId: u.id, reason: "daily_fuel" });
  }

  // 8. reset_unit_action_flags — the active player's surviving units may act.
  for (const u of activeUnits) {
    if (unpayable.has(u.id)) continue;
    const current: UnitState | undefined = unitById(next, u.id);
    if (current !== undefined && current.hasActed) {
      next = replaceUnit(next, { ...current, hasActed: false });
    }
  }

  // 9–11. commander power / visibility / victory (M3 no-op hooks).
  next = commanderPowerHook(next);
  next = recalculateVisibilityHook(next);
  next = evaluateVictoryHook(next);

  // 12. set_turn_deadline — clear the previous turn's deadline; the backend
  //     stamps the new instant on seeing `turn_started` (§3, clock is injected).
  next = updateMatch(next, { turnDeadlineAt: null });

  // 13. emit_turn_started (final ordered step).
  events.push({ type: "turn_started", playerId: activeId, day });

  return { nextState: next, events };
}
