/**
 * Pure helpers over `MatchState`: derived values, lookups by id and coordinate,
 * deterministic ordering, and immutable-update helpers.
 *
 * Every update returns a **new** `MatchState` via structural sharing and never
 * mutates its input (`engine_contract.purity`). Ordering follows the canonical
 * `y asc, x asc, id asc` rule so start-of-turn processing and tests are stable
 * (`rules.yaml` → turn_sequence.start_of_turn).
 *
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T1)
 */

import type {
  Coordinate,
  Id,
  MatchMeta,
  MatchState,
  PlayerState,
  PropertyState,
  UnitState,
} from "./state";

/** Displayed HP, derived from true HP (`ceil(trueHp / 10)`, §9.2). Never stored. */
export function displayHp(trueHp: number): number {
  return Math.ceil(trueHp / 10);
}

/** Whether two coordinates are the same cell. */
export function sameCoordinate(a: Coordinate, b: Coordinate): boolean {
  return a.x === b.x && a.y === b.y;
}

/** The unit with `id`, or `undefined`. */
export function unitById(state: MatchState, id: Id): UnitState | undefined {
  return state.units.find((u) => u.id === id);
}

/** The board-occupying unit at `coord`, or `undefined` (cargo has no position). */
export function unitAt(
  state: MatchState,
  coord: Coordinate,
): UnitState | undefined {
  return state.units.find(
    (u) => u.position !== null && sameCoordinate(u.position, coord),
  );
}

/** The property with `id`, or `undefined`. */
export function propertyById(
  state: MatchState,
  id: Id,
): PropertyState | undefined {
  return state.properties.find((p) => p.id === id);
}

/** The property at `coord`, or `undefined`. */
export function propertyAt(
  state: MatchState,
  coord: Coordinate,
): PropertyState | undefined {
  return state.properties.find((p) => sameCoordinate(p.position, coord));
}

/** The player with `id`, or `undefined`. */
export function playerById(state: MatchState, id: Id): PlayerState | undefined {
  return state.players.find((p) => p.playerId === id);
}

/**
 * Compare two positioned entities in canonical board order: `y asc, x asc, id
 * asc`, with entities lacking a position (cargo) sorted last. Use as an
 * `Array.sort` comparator to make ordered processing deterministic.
 */
export function compareBoardOrder(
  a: { readonly position: Coordinate | null; readonly id: Id },
  b: { readonly position: Coordinate | null; readonly id: Id },
): number {
  if (a.position === null || b.position === null) {
    if (a.position === b.position)
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return a.position === null ? 1 : -1;
  }
  if (a.position.y !== b.position.y) return a.position.y - b.position.y;
  if (a.position.x !== b.position.x) return a.position.x - b.position.x;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Return a new state with `unit` replacing the unit of the same id. */
export function replaceUnit(state: MatchState, unit: UnitState): MatchState {
  return {
    ...state,
    units: state.units.map((u) => (u.id === unit.id ? unit : u)),
  };
}

/** Return a new state with the unit `unitId` removed. */
export function removeUnit(state: MatchState, unitId: Id): MatchState {
  return { ...state, units: state.units.filter((u) => u.id !== unitId) };
}

/** Return a new state with `property` replacing the property of the same id. */
export function replaceProperty(
  state: MatchState,
  property: PropertyState,
): MatchState {
  return {
    ...state,
    properties: state.properties.map((p) =>
      p.id === property.id ? property : p,
    ),
  };
}

/** Return a new state with a patch applied to the player `playerId`. */
export function updatePlayer(
  state: MatchState,
  playerId: Id,
  patch: Partial<Omit<PlayerState, "playerId">>,
): MatchState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.playerId === playerId ? { ...p, ...patch } : p,
    ),
  };
}

/** Return a new state with a patch applied to the match-level fields. */
export function updateMatch(
  state: MatchState,
  patch: Partial<MatchMeta>,
): MatchState {
  return { ...state, match: { ...state.match, ...patch } };
}
