import type { MapView } from "@/app/server/actions/read";

/**
 * Logical-terrain → layered render-tile model (M10-T2).
 *
 * Each cell emits an ordered list of atlas tiles (bottom → top). Opaque bases
 * (`sea` / `plain`) sit under transparent coast / forest / mountain / road
 * overlays so the dark Phaser clear color never shows through autotile holes.
 *
 * Coast overlays use the cliff water-channel set at cols 2–5, rows 0–3
 * (`assets-inventory.md` §4.2) indexed by an orthogonal land-neighbor mask.
 * Roads use the thin asphalt pair at row 12 plus a junction heuristic.
 * Forest and mountain use the atlas E–W strip (standalone / west / mid / east)
 * on a single silhouette row — not a full 4×4 blob mask.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T2)
 */

/** Opaque fill tiles (`terrain.yaml` preferred bases). */
export const FILL_TILE = {
  plain: "terrain_r01_c01",
  sea: "terrain_r01_c00",
} as const;

/** Fallback single-tile ids for terrains without neighbor logic. */
export const BASE_TERRAIN_TILE: Record<string, string> = {
  plain: FILL_TILE.plain,
  /** Soft standalone canopy (`terrain.yaml` variants; not dense fill). */
  forest: "terrain_r04_c06",
  /** Soft standalone peak. */
  mountain: "terrain_r00_c06",
  road: "terrain_r12_c00",
  river: "terrain_r06_c02",
  sea: FILL_TILE.sea,
  shoal: "terrain_r09_c02",
};

/** Asphalt road tiles (`assets-inventory.md` §4.5). */
const ROAD_VERTICAL = "terrain_r12_c00";
const ROAD_HORIZONTAL = "terrain_r12_c01";

/** Orthogonal land-neighbor bits: N=1, E=2, S=4, W=8. */
const N = 1;
const E = 2;
const S = 4;
const W = 8;

/**
 * Cliff coast set (rows 0–3, cols 2–5) indexed by land-neighbor mask.
 * Mask 0 (open water) uses the solid sea fill — no overlay.
 */
const COAST_BY_MASK: Record<number, string> = {
  [N]: "terrain_r00_c03",
  [E]: "terrain_r01_c04",
  [N | E]: "terrain_r00_c04",
  [S]: "terrain_r02_c03",
  [N | S]: "terrain_r03_c03",
  [S | E]: "terrain_r02_c04",
  [N | S | E]: "terrain_r03_c04",
  [W]: "terrain_r01_c02",
  [N | W]: "terrain_r00_c02",
  [E | W]: "terrain_r01_c05",
  [N | E | W]: "terrain_r00_c05",
  [S | W]: "terrain_r02_c02",
  [N | S | W]: "terrain_r03_c02",
  [S | E | W]: "terrain_r02_c05",
  [N | E | S | W]: "terrain_r03_c05",
};

/**
 * Forest / mountain horizontal strips (`terrain.yaml`: autotile_required false
 * for full blob, but the atlas row is a 4-cell E–W strip):
 * ```
 *   c06 standalone (soft all sides)
 *   c07 west / left end   (open east)
 *   c08 middle            (open east+west)
 *   c09 east / right end  (open west)
 * ```
 * Forest uses row 4; mountain uses row 0. N/S neighbors do not change the cell —
 * each stamp is a complete vertical silhouette.
 */
const FOREST_STRIP_ROW = 4;
const MOUNTAIN_STRIP_ROW = 0;

function stripCellId(row: number, col: number): string {
  return `terrain_r${String(row).padStart(2, "0")}_c${String(col).padStart(2, "0")}`;
}

/** Pick standalone / west / mid / east from E–W same-terrain neighbors. */
function overlayFromHorizontalStrip(
  map: MapView,
  x: number,
  y: number,
  row: number,
  isSame: (terrainId: string | undefined) => boolean,
): string {
  const hasE = isSame(terrainAt(map, x + 1, y));
  const hasW = isSame(terrainAt(map, x - 1, y));
  if (!hasE && !hasW) return stripCellId(row, 6); // standalone
  if (hasE && !hasW) return stripCellId(row, 7); // west end
  if (hasE && hasW) return stripCellId(row, 8); // middle
  return stripCellId(row, 9); // east end (hasW && !hasE)
}

const WATER_TERRAIN = new Set(["sea", "shoal", "river"]);
const LAND_TERRAIN = new Set([
  "plain",
  "forest",
  "mountain",
  "road",
  "city",
  "base",
  "airport",
  "port",
  "headquarters",
]);

/** The render tile for a logical terrain; falls back to plain for the unmapped. */
export function renderTileFor(terrainId: string): string {
  return BASE_TERRAIN_TILE[terrainId] ?? BASE_TERRAIN_TILE.plain;
}

export interface TerrainCell {
  readonly x: number;
  readonly y: number;
  readonly terrainId: string;
  /**
   * Ordered atlas tiles bottom → top. Prefer this over `renderTileId` when
   * drawing; `renderTileId` remains the topmost tile for tests/tooling.
   */
  readonly layers: readonly string[];
  /** Topmost layer (compat with earlier single-tile callers). */
  readonly renderTileId: string;
  /** Whether the viewer currently sees this tile (drives the fog overlay). */
  readonly visible: boolean;
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function terrainAt(map: MapView, x: number, y: number): string | undefined {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return undefined;
  return map.logicalTerrain[y]?.[x];
}

/** Orthogonal neighbor mask where each bit means the neighbor matches `pred`. */
export function neighborMask(
  map: MapView,
  x: number,
  y: number,
  pred: (terrainId: string | undefined) => boolean,
): number {
  let mask = 0;
  if (pred(terrainAt(map, x, y - 1))) mask |= N;
  if (pred(terrainAt(map, x + 1, y))) mask |= E;
  if (pred(terrainAt(map, x, y + 1))) mask |= S;
  if (pred(terrainAt(map, x - 1, y))) mask |= W;
  return mask;
}

function isLand(terrainId: string | undefined): boolean {
  return terrainId !== undefined && LAND_TERRAIN.has(terrainId);
}

function isWater(terrainId: string | undefined): boolean {
  return terrainId !== undefined && WATER_TERRAIN.has(terrainId);
}

function isRoad(terrainId: string | undefined): boolean {
  return terrainId === "road";
}

function isForest(terrainId: string | undefined): boolean {
  return terrainId === "forest";
}

function isMountain(terrainId: string | undefined): boolean {
  return terrainId === "mountain";
}

/** Coast overlay for a water cell from its land-neighbor mask; null if open sea. */
export function coastOverlayTile(
  map: MapView,
  x: number,
  y: number,
): string | null {
  const mask = neighborMask(map, x, y, isLand);
  if (mask === 0) return null;
  return COAST_BY_MASK[mask] ?? null;
}

/**
 * Picks a road atlas cell from orthogonal road neighbors. Lone / N–S → vertical
 * asphalt; E–W-only → horizontal; junctions (both axes) → horizontal.
 */
export function roadRenderTile(map: MapView, x: number, y: number): string {
  const mask = neighborMask(map, x, y, isRoad);
  const ns = (mask & N) !== 0 || (mask & S) !== 0;
  const ew = (mask & E) !== 0 || (mask & W) !== 0;
  if (ew && !ns) return ROAD_HORIZONTAL;
  if (ns && !ew) return ROAD_VERTICAL;
  if (ew && ns) return ROAD_HORIZONTAL;
  return ROAD_VERTICAL;
}

export function forestOverlayTile(map: MapView, x: number, y: number): string {
  return overlayFromHorizontalStrip(map, x, y, FOREST_STRIP_ROW, isForest);
}

export function mountainOverlayTile(
  map: MapView,
  x: number,
  y: number,
): string {
  return overlayFromHorizontalStrip(map, x, y, MOUNTAIN_STRIP_ROW, isMountain);
}

/** Build the bottom→top layer stack for one logical cell. */
export function layersForCell(map: MapView, x: number, y: number): string[] {
  const terrainId = terrainAt(map, x, y) ?? "plain";

  if (isWater(terrainId)) {
    const layers: string[] = [FILL_TILE.sea];
    const coast = coastOverlayTile(map, x, y);
    if (coast !== null) layers.push(coast);
    // Shoal uses the sand-ish overlay cell on top of the coast when present.
    if (terrainId === "shoal") {
      layers.push(BASE_TERRAIN_TILE.shoal);
    }
    if (terrainId === "river" && coast === null) {
      layers.push(BASE_TERRAIN_TILE.river);
    }
    return layers;
  }

  // Land — opaque grass under every land feature / property underlay.
  const layers: string[] = [FILL_TILE.plain];
  if (terrainId === "forest") {
    layers.push(forestOverlayTile(map, x, y));
  } else if (terrainId === "mountain") {
    layers.push(mountainOverlayTile(map, x, y));
  } else if (terrainId === "road") {
    layers.push(roadRenderTile(map, x, y));
  }
  return layers;
}

/**
 * Builds the ordered terrain render model for a map + fog view. Cells are
 * row-major (`y` outer, `x` inner); a cell outside the fog set renders under the
 * fog overlay.
 */
export function buildTerrainRenderModel(
  map: MapView,
  visibleTiles: readonly { readonly x: number; readonly y: number }[],
): TerrainCell[] {
  const visible = new Set(visibleTiles.map((t) => tileKey(t.x, t.y)));
  const cells: TerrainCell[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const terrainId = terrainAt(map, x, y) ?? "plain";
      const layers = layersForCell(map, x, y);
      cells.push({
        x,
        y,
        terrainId,
        layers,
        renderTileId: layers[layers.length - 1] ?? FILL_TILE.plain,
        visible: visible.has(tileKey(x, y)),
      });
    }
  }
  return cells;
}
