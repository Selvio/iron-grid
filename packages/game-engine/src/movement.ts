/**
 * Movement geometry: reachability (`calculateMovementRange`) and validation of a
 * submitted path (`validateMovementPath`) — `game-specification.md` §10, §17.1
 * and `rules.yaml` → `movement_rules`.
 *
 * Both are pure and data-driven: terrain movement costs come from `terrain.yaml`
 * via the match's map (`GameData.maps[mapId].logical_terrain`), never hardcoded.
 * Two independent budgets bound a move (§10.2): cumulative **terrain cost** must
 * not exceed the unit's movement points, and the **tile count** must not exceed
 * its fuel — one fuel per traversed tile (§10.3, `fuel_cost_per_traversed_tile`),
 * regardless of each tile's movement-point cost.
 *
 * Occupancy (§10.2, `movement_rules`): enemy units block entry entirely; friendly
 * units may be passed through but not ended upon (Join/Load exceptions are M3);
 * impassable terrain and Pipe barriers are `null`-cost tiles and so are excluded
 * by the same traversability check. Normal visibility only — the fog
 * hidden-collision fuel rule (`movement_rules.hidden_collision`, §33.5) is M3.
 *
 * @see docs/02-data/rules.yaml → movement_rules
 * @see docs/01-specification/game-specification.md §10, §17.1
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T3)
 */

import type { GameData } from "game-data";

import { unitAt, unitById } from "./board";
import type { MovementRange, ValidationError } from "./engine";
import type { Coordinate, Id, MatchState } from "./state";

/** A validated unit definition, resolved from `GameData` by `typeId`. */
type UnitDef = GameData["units"][string];
/** A unit's movement type (`units.yaml` movement.type). */
type MovementType = UnitDef["movement"]["type"];
/** A validated map instance (`maps.yaml`). */
type GameMap = GameData["maps"][string];

/** The result of validating a submitted movement path (consumed by M2-T4). */
export interface MovementPathResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  /** Sum of terrain movement costs over the traversed tiles (§10.2). */
  readonly movementCost: number;
  /** Tiles traversed, i.e. fuel spent — `path.length - 1` (§10.3). */
  readonly fuelCost: number;
}

/** The four orthogonally adjacent coordinates (`movement_rules.adjacency`). */
function orthogonalNeighbors(c: Coordinate): Coordinate[] {
  return [
    { x: c.x, y: c.y - 1 },
    { x: c.x, y: c.y + 1 },
    { x: c.x - 1, y: c.y },
    { x: c.x + 1, y: c.y },
  ];
}

/** Whether `b` is orthogonally adjacent to `a` (one step, no diagonal). */
function isOrthogonalStep(a: Coordinate, b: Coordinate): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/**
 * The terrain movement cost for `movementType` at `coord`, or `null` when the
 * tile is off-map, unknown, or impassable to that type (Pipe barriers included).
 */
function stepCostAt(
  gameData: GameData,
  map: GameMap,
  coord: Coordinate,
  movementType: MovementType,
): number | null {
  const { width, height } = map.dimensions;
  if (coord.x < 0 || coord.x >= width || coord.y < 0 || coord.y >= height) {
    return null;
  }
  const terrainId = map.logical_terrain[coord.y]?.[coord.x];
  if (terrainId === undefined) return null;
  const terrain = gameData.terrain[terrainId];
  if (terrain === undefined) return null;
  return terrain.movement_costs[movementType];
}

/** Resolve the unit, its definition and the match map, or throw on any gap. */
function resolveContext(
  state: MatchState,
  unitId: Id,
  gameData: GameData,
): { unit: ReturnType<typeof unitById>; def: UnitDef; map: GameMap } {
  const unit = unitById(state, unitId);
  if (unit === undefined) {
    throw new Error(`movement: unit ${unitId} is not in the match`);
  }
  const def = gameData.units[unit.typeId];
  if (def === undefined) {
    throw new Error(
      `movement: unit ${unitId} has unknown type "${unit.typeId}"`,
    );
  }
  const map = gameData.maps[state.match.mapId];
  if (map === undefined) {
    throw new Error(`movement: map "${state.match.mapId}" is not in game data`);
  }
  return { unit, def, map };
}

/**
 * The tiles a unit can legally move to and end on this activation.
 *
 * A Dijkstra over terrain cost with a second per-label budget on tile count
 * (fuel): a tile enters the search only when both `cumulativeCost <= points` and
 * `tiles <= fuel` hold, so the range shrinks as soon as fuel drops below the
 * movement points. Friendly-occupied tiles are traversed but excluded from the
 * result; enemy-occupied and impassable tiles are never entered. The unit's own
 * tile is not a destination (staying put is `Wait`, enumerated separately).
 */
export function calculateMovementRange(
  state: MatchState,
  unitId: Id,
  gameData: GameData,
): MovementRange {
  const { unit, def, map } = resolveContext(state, unitId, gameData);
  // Loaded cargo (no board position) has no movement range.
  if (unit === undefined || unit.position === null) {
    return { unitId, reachable: [] };
  }

  const movementType = def.movement.type;
  const maxCost = def.movement.points;
  const maxTiles = unit.fuel; // one fuel per traversed tile (§10.3)
  const origin = unit.position;
  const key = (c: Coordinate): string => `${c.x},${c.y}`;

  // Per-tile Pareto frontier of (cost, tiles); a new label is skipped when an
  // existing one is at least as cheap on both axes.
  const frontier = new Map<string, { cost: number; tiles: number }[]>();
  const reachable = new Map<string, Coordinate>();

  const dominated = (k: string, cost: number, tiles: number): boolean =>
    (frontier.get(k) ?? []).some((l) => l.cost <= cost && l.tiles <= tiles);
  const record = (k: string, cost: number, tiles: number): void => {
    const labels = frontier.get(k);
    if (labels === undefined) frontier.set(k, [{ cost, tiles }]);
    else labels.push({ cost, tiles });
  };

  record(key(origin), 0, 0);
  const queue: { coord: Coordinate; cost: number; tiles: number }[] = [
    { coord: origin, cost: 0, tiles: 0 },
  ];

  while (queue.length > 0) {
    // Pop the lowest-cost label (small grid — linear scan is ample).
    let min = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i]!.cost < queue[min]!.cost) min = i;
    }
    const current = queue.splice(min, 1)[0]!;

    for (const next of orthogonalNeighbors(current.coord)) {
      const cost = stepCostAt(gameData, map, next, movementType);
      if (cost === null) continue; // off-map, unknown or impassable

      const occupant = unitAt(state, next);
      // Enemy units block entry entirely (no pass-through, §10.2).
      if (
        occupant !== undefined &&
        occupant.ownerPlayerId !== unit.ownerPlayerId
      ) {
        continue;
      }

      const newCost = current.cost + cost;
      const newTiles = current.tiles + 1;
      if (newCost > maxCost || newTiles > maxTiles) continue;

      const k = key(next);
      if (dominated(k, newCost, newTiles)) continue;
      record(k, newCost, newTiles);
      queue.push({ coord: next, cost: newCost, tiles: newTiles });

      // A tile is a valid destination only when nothing occupies it — the unit
      // may pass through a friendly but not end on it (Join/Load are M3).
      if (occupant === undefined) reachable.set(k, next);
    }
  }

  const list = [...reachable.values()].sort((a, b) => a.y - b.y || a.x - b.x);
  return { unitId, reachable: list };
}

/**
 * Validate a submitted ordered path for `unitId` (§10.2). Returns the aggregated
 * rejection reasons plus the resolved movement and fuel costs so the apply step
 * (M2-T4) can commit them without recomputing. Structural faults (bad start,
 * non-orthogonal step, off-map/impassable tile, enemy pass-through) stop the
 * walk; the budget and destination checks then run on the resolved prefix.
 */
export function validateMovementPath(
  state: MatchState,
  unitId: Id,
  path: readonly Coordinate[],
  gameData: GameData,
): MovementPathResult {
  const errors: ValidationError[] = [];
  const fail = (code: ValidationError["code"], message?: string): void => {
    errors.push(message === undefined ? { code } : { code, message });
  };
  const done = (
    movementCost: number,
    fuelCost: number,
  ): MovementPathResult => ({
    valid: errors.length === 0,
    errors,
    movementCost,
    fuelCost,
  });

  const { unit, def, map } = resolveContext(state, unitId, gameData);
  if (unit === undefined || unit.position === null) {
    fail("invalid_unit", "unit is not on the board");
    return done(0, 0);
  }

  // Path must be non-empty and start on the unit's current tile.
  const start = path[0];
  if (
    start === undefined ||
    start.x !== unit.position.x ||
    start.y !== unit.position.y
  ) {
    fail("invalid_path", "path must start at the unit's position");
    return done(0, 0);
  }

  const movementType = def.movement.type;
  let movementCost = 0;
  let structural = true;
  for (let i = 1; i < path.length && structural; i++) {
    const prev = path[i - 1]!;
    const tile = path[i]!;
    if (!isOrthogonalStep(prev, tile)) {
      fail("invalid_path", "steps must be orthogonally adjacent");
      structural = false;
      break;
    }
    const cost = stepCostAt(gameData, map, tile, movementType);
    if (cost === null) {
      fail("path_blocked", "tile is off-map or impassable to this unit");
      structural = false;
      break;
    }
    const occupant = unitAt(state, tile);
    if (
      occupant !== undefined &&
      occupant.ownerPlayerId !== unit.ownerPlayerId
    ) {
      fail("path_blocked", "cannot pass through an enemy unit");
      structural = false;
      break;
    }
    movementCost += cost;
  }

  const fuelCost = path.length - 1;
  if (!structural) return done(movementCost, fuelCost);

  // Budget checks: terrain cost against movement points, tiles against fuel.
  if (movementCost > def.movement.points) {
    fail("insufficient_movement", "path exceeds the unit's movement points");
  }
  if (fuelCost > unit.fuel) {
    fail("insufficient_fuel", "path exceeds the unit's remaining fuel");
  }

  // The destination must be unoccupied (a zero-length path ends on the unit's
  // own tile, which is allowed — that is a stationary Wait).
  const destination = path[path.length - 1]!;
  const occupant = unitAt(state, destination);
  if (occupant !== undefined && occupant.id !== unit.id) {
    fail("destination_occupied", "another unit occupies the destination");
  }

  return done(movementCost, fuelCost);
}
