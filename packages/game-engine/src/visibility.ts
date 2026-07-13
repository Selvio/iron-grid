/**
 * Fog of war: per-player visibility and the private state projection (§18;
 * `rules.yaml` → `fog_of_war_rules`).
 *
 * `calculateVisibility` returns the tiles a player can see — a range-based fog map
 * from owned units (base vision plus the Mountain bonus for eligible units) and
 * owned properties (range 1). `projectStateForPlayer` filters authoritative state
 * to that viewer (§18.7): own units and public property ownership are always
 * shown, while an enemy unit appears only when its tile is visible and it is not
 * concealed — hidden in Forest (ground) or Reef (naval) without an adjacent
 * detector, or a submerged Submarine without an adjacent Cruiser (§18.4). Enemy
 * cargo and capture progress never leak. Visibility is derived on demand, so it
 * is always current (§18.6). Draws no randomness.
 *
 * @see docs/02-data/rules.yaml → fog_of_war_rules
 * @see docs/01-specification/game-specification.md §18
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T6)
 */

import type { GameData } from "game-data";

import { unitAt } from "./board";
import type { PlayerView, Visibility } from "./engine";
import type { Coordinate, Id, MatchState, UnitState } from "./state";

type UnitDef = GameData["units"][string];
type TerrainDef = GameData["terrain"][string];

/** Owned properties reveal a small radius around themselves (`property_vision`). */
const PROPERTY_VISION_RANGE = 1;

const key = (c: Coordinate): string => `${c.x},${c.y}`;

/** The terrain at `coord` on the match map, or undefined when off-map. */
function terrainAt(
  gameData: GameData,
  mapId: Id,
  coord: Coordinate,
): TerrainDef | undefined {
  const map = gameData.maps[mapId];
  if (map === undefined) return undefined;
  const { width, height } = map.dimensions;
  if (coord.x < 0 || coord.x >= width || coord.y < 0 || coord.y >= height) {
    return undefined;
  }
  const id = map.logical_terrain[coord.y]?.[coord.x];
  return id === undefined ? undefined : gameData.terrain[id];
}

/** The concealment category and vision bonus a terrain carries (`terrain.yaml` fog). */
function terrainFog(terrain: TerrainDef | undefined): {
  readonly concealment: string;
  readonly visionBonus: number;
} {
  const fog = (
    terrain as
      | { fog?: { concealment?: string; vision_bonus?: { amount?: number } } }
      | undefined
  )?.fog;
  return {
    concealment: fog?.concealment ?? "none",
    visionBonus: fog?.vision_bonus?.amount ?? 0,
  };
}

/** Whether a unit gains the Mountain vision bonus (`units.yaml` vision). */
function mountainEligible(def: UnitDef): boolean {
  return (
    (def.vision as unknown as { mountain_bonus_eligible?: unknown })
      .mountain_bonus_eligible === true
  );
}

/** Whether a unit can reveal a hidden enemy of the given kind from adjacency. */
function detects(def: UnitDef, kind: "forest" | "reef" | "sub"): boolean {
  const d = (
    def.vision as unknown as {
      hidden_unit_detection?: {
        adjacent_forest?: unknown;
        adjacent_reef?: unknown;
        submerged_submarine?: unknown;
      };
    }
  ).hidden_unit_detection;
  if (d === undefined) return false;
  if (kind === "forest") return d.adjacent_forest === true;
  if (kind === "reef") return d.adjacent_reef === true;
  return d.submerged_submarine === true;
}

/** A unit's effective vision range: base plus the Mountain bonus when eligible. */
function visionRange(
  gameData: GameData,
  mapId: Id,
  unit: UnitState,
  def: UnitDef,
): number {
  const base = def.vision.base_range;
  if (unit.position === null || !mountainEligible(def)) return base;
  return (
    base + terrainFog(terrainAt(gameData, mapId, unit.position)).visionBonus
  );
}

/** Add every in-bounds tile within `range` (Manhattan) of `center` to `tiles`. */
function addWithinRange(
  gameData: GameData,
  mapId: Id,
  center: Coordinate,
  range: number,
  tiles: Map<string, Coordinate>,
): void {
  const map = gameData.maps[mapId];
  if (map === undefined) return;
  const { width, height } = map.dimensions;
  for (let dy = -range; dy <= range; dy++) {
    const spread = range - Math.abs(dy);
    for (let dx = -spread; dx <= spread; dx++) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      tiles.set(`${x},${y}`, { x, y });
    }
  }
}

/**
 * The tiles `playerId` can currently see — the union of every owned unit's and
 * property's vision radius, bounded to the map (§18.2–§18.3).
 */
export function calculateVisibility(
  state: MatchState,
  playerId: Id,
  gameData: GameData,
): Visibility {
  const mapId = state.match.mapId;
  const tiles = new Map<string, Coordinate>();

  for (const unit of state.units) {
    if (unit.ownerPlayerId !== playerId || unit.position === null) continue;
    const def = gameData.units[unit.typeId];
    if (def === undefined) continue;
    addWithinRange(
      gameData,
      mapId,
      unit.position,
      visionRange(gameData, mapId, unit, def),
      tiles,
    );
  }
  for (const property of state.properties) {
    if (property.ownerPlayerId !== playerId) continue;
    addWithinRange(
      gameData,
      mapId,
      property.position,
      PROPERTY_VISION_RANGE,
      tiles,
    );
  }

  return { playerId, visible: [...tiles.values()] };
}

/** Whether `viewerId` has a unit adjacent to `coord` that detects `kind`. */
function hasAdjacentDetector(
  state: MatchState,
  gameData: GameData,
  viewerId: Id,
  coord: Coordinate,
  kind: "forest" | "reef" | "sub",
): boolean {
  const neighbors = [
    { x: coord.x, y: coord.y - 1 },
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x + 1, y: coord.y },
  ];
  for (const n of neighbors) {
    const u = unitAt(state, n);
    if (u === undefined || u.ownerPlayerId !== viewerId) continue;
    const def = gameData.units[u.typeId];
    if (def !== undefined && detects(def, kind)) return true;
  }
  return false;
}

/**
 * Whether `viewer` can see `enemy` (§18.4): its tile must be visible, and it must
 * not be concealed by hidden terrain or as a submerged submarine without an
 * adjacent detector.
 */
export function isEnemyUnitVisible(
  state: MatchState,
  viewerId: Id,
  enemy: UnitState,
  visibleTiles: ReadonlySet<string>,
  gameData: GameData,
): boolean {
  if (enemy.position === null) return false; // loaded cargo
  if (!visibleTiles.has(key(enemy.position))) return false; // shrouded

  if (enemy.specialState === "submerged") {
    return hasAdjacentDetector(
      state,
      gameData,
      viewerId,
      enemy.position,
      "sub",
    );
  }

  const def = gameData.units[enemy.typeId];
  const concealment = terrainFog(
    terrainAt(gameData, state.match.mapId, enemy.position),
  ).concealment;
  if (
    def !== undefined &&
    concealment !== "none" &&
    concealment === def.category
  ) {
    const kind = concealment === "ground" ? "forest" : "reef";
    return hasAdjacentDetector(state, gameData, viewerId, enemy.position, kind);
  }
  return true;
}

/** Strip an enemy unit down to what the viewer may know (§16.5, capture leak). */
function sanitizeEnemy(unit: UnitState): UnitState {
  return { ...unit, cargoUnitIds: [], captureTargetPropertyId: null };
}

/**
 * The state as `playerId` may observe it (§18.7): own units in full, visible
 * enemy units sanitized, and public property ownership. When fog is off every
 * board unit is visible; enemy cargo identity is hidden either way.
 */
export function projectStateForPlayer(
  state: MatchState,
  playerId: Id,
  gameData: GameData,
): PlayerView {
  const visible = calculateVisibility(state, playerId, gameData).visible;
  const visibleSet = new Set(visible.map(key));
  const fog = state.match.fogEnabled === true;

  const units: UnitState[] = [];
  for (const unit of state.units) {
    if (unit.ownerPlayerId === playerId) {
      units.push(unit); // own units are always fully visible
      continue;
    }
    if (unit.position === null) continue; // enemy cargo never leaks
    if (
      fog &&
      !isEnemyUnitVisible(state, playerId, unit, visibleSet, gameData)
    ) {
      continue;
    }
    units.push(sanitizeEnemy(unit));
  }

  return {
    viewerPlayerId: playerId,
    visibleTiles: visible,
    units,
    properties: state.properties,
  };
}
