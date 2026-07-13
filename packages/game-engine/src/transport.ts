/**
 * Transport load/unload (§16; `rules.yaml` → `transport_rules`).
 *
 * A cargo unit moves onto a friendly transport with spare capacity for its type
 * and is removed from board occupancy (§16.2); it later unloads onto an adjacent,
 * empty, terrain-legal tile (§16.3). Nested transport is forbidden and loaded
 * cargo is `has_acted`. Destroying a transport takes its cargo down atomically —
 * that cascade lives in `destroyUnit` (M3-T1). Draws no randomness.
 *
 * @see docs/02-data/rules.yaml → transport_rules
 * @see docs/01-specification/game-specification.md §16
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T5)
 */

import type { GameData } from "game-data";

import type { LoadAction, UnloadAction } from "./actions";
import { replaceUnit, unitAt, unitById } from "./board";
import type { EngineResult, ValidationError, ValidationResult } from "./engine";
import type { Event } from "./events";
import { terrainMovementCost, validateMovementPath } from "./movement";
import type { Coordinate, MatchState } from "./state";

/** Orthogonal (Manhattan) distance between two tiles. */
function distance(a: Coordinate, b: Coordinate): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// --- Load -------------------------------------------------------------------

/** Validate a `load` (turn/ownership, capability, path, capacity, cargo type; §16.2). */
export function validateLoad(
  state: MatchState,
  action: LoadAction,
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

  const cargo = unitById(state, action.unitId);
  if (cargo === undefined || cargo.position === null) {
    errors.push({ code: "invalid_unit" });
    return done();
  }
  if (cargo.ownerPlayerId !== action.playerId) {
    errors.push({ code: "unit_not_owned" });
  }
  if (cargo.hasActed) errors.push({ code: "unit_already_acted" });

  const cargoDef = gameData.units[cargo.typeId];
  const destination = action.path[action.path.length - 1];
  if (
    cargoDef === undefined ||
    destination === undefined ||
    action.path.length < 2
  ) {
    errors.push({ code: "invalid_transport" });
    return done();
  }
  // No nested transport (§16.2); the cargo must be able to move and load.
  if (!cargoDef.movement.can_move_and_load || cargo.cargoUnitIds.length > 0) {
    errors.push({ code: "invalid_transport" });
  }

  // Path legal to the transport's tile; ending on the friendly transport is the
  // load exception, so ignore only the destination-occupied rejection.
  const move = validateMovementPath(
    state,
    action.unitId,
    action.path,
    gameData,
  );
  errors.push(...move.errors.filter((e) => e.code !== "destination_occupied"));

  const transport = unitAt(state, destination);
  const transportDef =
    transport === undefined ? undefined : gameData.units[transport.typeId];
  if (
    transport === undefined ||
    transportDef === undefined ||
    transport.id === cargo.id ||
    transport.ownerPlayerId !== cargo.ownerPlayerId ||
    !transportDef.capabilities.can_transport ||
    transport.cargoUnitIds.length >= transportDef.transport.capacity ||
    !transportDef.transport.allowed_cargo.includes(cargo.typeId)
  ) {
    errors.push({ code: "invalid_transport" });
  }

  return done();
}

/** Apply a validated `load`: move the cargo off the board into the transport. */
export function applyLoad(state: MatchState, action: LoadAction): EngineResult {
  const cargo = unitById(state, action.unitId)!;
  const destination = action.path[action.path.length - 1]!;
  const transport = unitAt(state, destination)!;
  const fuelSpent = action.path.length - 1;

  const events: Event[] = [
    {
      type: "unit_moved",
      unitId: cargo.id,
      path: action.path,
      fuelSpent,
      fuelAfter: cargo.fuel - fuelSpent,
    },
  ];

  // Cargo leaves board occupancy (position null), keeps its fuel, and is acted.
  let next = replaceUnit(state, {
    ...cargo,
    position: null,
    fuel: cargo.fuel - fuelSpent,
    hasActed: true,
  });
  next = replaceUnit(next, {
    ...transport,
    cargoUnitIds: [...transport.cargoUnitIds, cargo.id],
  });
  events.push({
    type: "unit_loaded",
    transportUnitId: transport.id,
    cargoUnitId: cargo.id,
  });

  return { nextState: next, events };
}

// --- Unload -----------------------------------------------------------------

/** Validate an `unload` (turn/ownership, optional move, adjacency, legality; §16.3). */
export function validateUnload(
  state: MatchState,
  action: UnloadAction,
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

  const transport = unitById(state, action.unitId);
  if (transport === undefined || transport.position === null) {
    errors.push({ code: "invalid_unit" });
    return done();
  }
  if (transport.ownerPlayerId !== action.playerId) {
    errors.push({ code: "unit_not_owned" });
  }
  if (transport.hasActed) errors.push({ code: "unit_already_acted" });

  const path = action.path;
  let from = transport.position;
  if (path !== undefined && path.length > 1) {
    const move = validateMovementPath(state, action.unitId, path, gameData);
    if (!move.valid) errors.push(...move.errors);
    from = path[path.length - 1] ?? from;
  }

  if (action.unloads.length === 0) errors.push({ code: "invalid_transport" });
  const usedTiles = new Set<string>();
  for (const target of action.unloads) {
    const cargo = unitById(state, target.cargoUnitId);
    const cargoDef =
      cargo === undefined ? undefined : gameData.units[cargo.typeId];
    const tileKey = `${target.to.x},${target.to.y}`;
    const occupant = unitAt(state, target.to);
    const traversable =
      cargoDef !== undefined &&
      terrainMovementCost(
        gameData,
        state.match.mapId,
        target.to,
        cargoDef.movement.type,
      ) !== null;
    if (
      cargo === undefined ||
      cargoDef === undefined ||
      !transport.cargoUnitIds.includes(target.cargoUnitId) ||
      distance(from, target.to) !== 1 ||
      !traversable ||
      (occupant !== undefined && occupant.id !== transport.id) ||
      usedTiles.has(tileKey)
    ) {
      errors.push({ code: "invalid_transport" });
    }
    usedTiles.add(tileKey);
  }

  return done();
}

/** Apply a validated `unload`: optional move, then place each cargo on its tile. */
export function applyUnload(
  state: MatchState,
  action: UnloadAction,
): EngineResult {
  const transport0 = unitById(state, action.unitId)!;
  const path = action.path;
  const moving = path !== undefined && path.length > 1;
  const from = moving ? path[path.length - 1]! : transport0.position!;
  const fuelSpent = moving ? path.length - 1 : 0;

  const events: Event[] = [];
  if (moving) {
    events.push({
      type: "unit_moved",
      unitId: transport0.id,
      path,
      fuelSpent,
      fuelAfter: transport0.fuel - fuelSpent,
    });
  }

  const remaining = transport0.cargoUnitIds.filter(
    (id) => !action.unloads.some((u) => u.cargoUnitId === id),
  );
  let next = replaceUnit(state, {
    ...transport0,
    position: from,
    fuel: transport0.fuel - fuelSpent,
    cargoUnitIds: remaining,
    hasActed: true,
  });

  for (const target of action.unloads) {
    const cargo = unitById(next, target.cargoUnitId);
    if (cargo === undefined) continue;
    next = replaceUnit(next, {
      ...cargo,
      position: target.to,
      hasActed: true,
    });
    events.push({
      type: "unit_unloaded",
      transportUnitId: transport0.id,
      cargoUnitId: target.cargoUnitId,
      position: target.to,
    });
  }

  return { nextState: next, events };
}
