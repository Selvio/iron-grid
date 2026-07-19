import type { MapView } from "@/app/server/actions/read";

/**
 * Logical-terrain → layered render-tile model (M10-T2, re-based on the Advance
 * Wars autotiles in M12).
 *
 * Each cell emits an ordered list of atlas tiles (bottom → top). The pack's
 * terrain files are 3×3 autotile sets: one file holds a terrain surrounded by
 * its neighbour, and the nine positions are the edges, corners and fill. Which
 * position a cell uses is decided by its four orthogonal neighbours — the same
 * selection the source project used (`TerrainRenderer.set*Location`), ported
 * here so coasts, rivers and roads connect the way they do in the original.
 *
 * Sea additionally takes 8×8 corner "stickers" where land cuts in diagonally,
 * which is why a layer carries an optional offset rather than always covering
 * the whole tile.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T2)
 * @see docs/decisions/0005-advance-wars-asset-pack.md
 */

/** One atlas tile of a cell's stack, optionally inset within the tile. */
export interface TileLayer {
  readonly key: string;
  /** Offset from the tile's top-left, in source pixels (default 0). */
  readonly dx?: number;
  readonly dy?: number;
}

/** Ground that a coast, beach or river treats as "land". */
const GROUND = new Set([
  "plain",
  "forest",
  "mountain",
  "hill",
  "road",
  "city",
  "base",
  "airport",
  "port",
  "headquarters",
  "silo",
]);
/** Terrain a water tile flows into without an edge. */
const NAVAL = new Set(["sea", "reef", "shoal", "river", "bridge"]);
/** Terrain that continues a river channel. */
const RIVER_FLOW = new Set(["river", "bridge", "sea"]);

const isGround = (t: string | undefined): boolean =>
  t !== undefined && GROUND.has(t);
const isNaval = (t: string | undefined): boolean =>
  t !== undefined && NAVAL.has(t);

/** The tile the property layer draws its building over. */
const PROPERTY_BASE = "terrain_plain";

export interface TerrainCell {
  readonly x: number;
  readonly y: number;
  readonly terrainId: string;
  /** Ordered atlas tiles bottom → top. */
  readonly layers: readonly TileLayer[];
  /** Topmost layer key (compat with earlier single-tile callers). */
  readonly renderTileId: string;
  /** Whether the viewer currently sees this tile (drives the fog overlay). */
  readonly visible: boolean;
}

function terrainAt(map: MapView, x: number, y: number): string | undefined {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return undefined;
  return map.logicalTerrain[y]?.[x];
}

/**
 * The four orthogonal neighbours as `[north, east, south, west]` — the order the
 * ported selection rules index by, where a pair's index sum names the corner
 * (0+1 north-east, 0+3 north-west, 1+2 south-east, 2+3 south-west).
 */
export function cross(
  map: MapView,
  x: number,
  y: number,
): [
  string | undefined,
  string | undefined,
  string | undefined,
  string | undefined,
] {
  return [
    terrainAt(map, x, y - 1),
    terrainAt(map, x + 1, y),
    terrainAt(map, x, y + 1),
    terrainAt(map, x - 1, y),
  ];
}

/** The two indexes of the neighbours matching `pred`, or null when not exactly two. */
function pair(
  neighbors: readonly (string | undefined)[],
  pred: (t: string | undefined) => boolean,
): [number, number] | null {
  const hits = [0, 1, 2, 3].filter((i) => pred(neighbors[i]));
  return hits.length === 2 ? [hits[0]!, hits[1]!] : null;
}

/** Coast edge for a water cell (`SeaLocation`). */
export function seaTile(map: MapView, x: number, y: number): string {
  const c = cross(map, x, y);
  const groundCount = c.filter(isGround).length;

  if (groundCount === 2) {
    const naval = pair(c, isNaval);
    if (naval !== null) {
      const [i, j] = naval;
      const sum = i + j;
      if (sum === 1) return "terrain_sea_bottom_left";
      if (sum === 3) {
        return i === 0 ? "terrain_sea_bottom_right" : "terrain_sea_top_left";
      }
      if (sum === 5) return "terrain_sea_top_right";
      return "terrain_sea"; // opposite sides: a channel, no corner art
    }
  }
  if (groundCount === 1) {
    if (!isNaval(c[0])) return "terrain_sea_top";
    if (!isNaval(c[1])) return "terrain_sea_right";
    if (!isNaval(c[2])) return "terrain_sea_bottom";
    if (!isNaval(c[3])) return "terrain_sea_left";
  }
  return "terrain_sea";
}

/**
 * The 8×8 corner stickers that round off a coast where land only touches the
 * tile diagonally — without them a diagonal shoreline reads as a staircase.
 */
export function seaCorners(map: MapView, x: number, y: number): TileLayer[] {
  const diagonals: [number, number, string, number, number][] = [
    [-1, -1, "terrain_sea_corner_top_left", 0, 0],
    [1, -1, "terrain_sea_corner_top_right", 8, 0],
    [1, 1, "terrain_sea_corner_bottom_right", 8, 8],
    [-1, 1, "terrain_sea_corner_bottom_left", 0, 8],
  ];
  const layers: TileLayer[] = [];
  for (const [dx, dy, key, ox, oy] of diagonals) {
    const diagonal = terrainAt(map, x + dx, y + dy);
    // Only when both orthogonal neighbors of that corner stay water: otherwise
    // the edge tile already draws the shoreline.
    const horizontal = terrainAt(map, x + dx, y);
    const vertical = terrainAt(map, x, y + dy);
    if (isGround(diagonal) && isNaval(horizontal) && isNaval(vertical)) {
      layers.push({ key, dx: ox, dy: oy });
    }
  }
  return layers;
}

/** Sand transition for a shoal cell (`BeachLocation`). */
export function beachTile(map: MapView, x: number, y: number): string {
  const c = cross(map, x, y);
  const groundCount = c.filter(isGround).length;

  if (groundCount === 3) {
    if (c[0] === "sea") return "terrain_beach_filled_bottom";
    if (c[1] === "sea") return "terrain_beach_filled_left";
    if (c[2] === "sea") return "terrain_beach_filled_top";
    if (c[3] === "sea") return "terrain_beach_filled_right";
  }
  if (groundCount === 2) {
    const sea = pair(c, (t) => t === "sea");
    if (sea !== null) {
      const [i, j] = sea;
      const sum = i + j;
      if (sum === 1) return "terrain_beach_outer_bottom_left";
      if (sum === 3) {
        return i === 0
          ? "terrain_beach_outer_bottom_right"
          : "terrain_beach_outer_top_left";
      }
      if (sum === 5) return "terrain_beach_outer_top_right";
    }
  }
  if (groundCount === 1) {
    if (isGround(c[0])) return "terrain_beach_bottom";
    if (isGround(c[1])) return "terrain_beach_left";
    if (isGround(c[2])) return "terrain_beach_top";
    if (isGround(c[3])) return "terrain_beach_right";
  }
  if (groundCount === 0) {
    const shoal = (t: string | undefined) => t === "shoal";
    if (shoal(c[0]) && shoal(c[1])) return "terrain_beach_inner_bottom_left";
    if (shoal(c[0]) && shoal(c[3])) return "terrain_beach_inner_bottom_right";
    if (shoal(c[2]) && shoal(c[1])) return "terrain_beach_inner_top_left";
    if (shoal(c[2]) && shoal(c[3])) return "terrain_beach_inner_top_right";
  }
  return "terrain_beach_top";
}

/** River channel piece (`RiverLocation`). */
export function riverTile(map: MapView, x: number, y: number): string {
  const c = cross(map, x, y);
  const flows = (t: string | undefined) => t !== undefined && RIVER_FLOW.has(t);
  const count = c.filter(flows).length;

  if (count === 4) return "terrain_river_center";
  if (count === 3) {
    if (!flows(c[0])) return "terrain_river_t_bottom";
    if (!flows(c[1])) return "terrain_river_t_left";
    if (!flows(c[2])) return "terrain_river_t_top";
    if (!flows(c[3])) return "terrain_river_t_right";
  }
  if (count === 2) {
    const ends = pair(c, flows)!;
    const [i, j] = ends;
    const sum = i + j;
    if (sum === 1) return "terrain_river_turn_top_right";
    if (sum === 2) return "terrain_river_vertical";
    if (sum === 3) {
      return i === 0
        ? "terrain_river_turn_top_left"
        : "terrain_river_turn_bottom_right";
    }
    if (sum === 4) return "terrain_river_horizontal";
    if (sum === 5) return "terrain_river_turn_bottom_left";
  }
  if (count === 1) {
    // A stub flowing into the sea keeps running rather than showing an end cap.
    if (flows(c[0])) {
      return c[2] === "sea"
        ? "terrain_river_vertical"
        : "terrain_river_bottom_end";
    }
    if (flows(c[1])) {
      return c[3] === "sea"
        ? "terrain_river_horizontal"
        : "terrain_river_left_end";
    }
    if (flows(c[2])) {
      return c[0] === "sea"
        ? "terrain_river_vertical"
        : "terrain_river_top_end";
    }
    if (flows(c[3])) {
      return c[1] === "sea"
        ? "terrain_river_horizontal"
        : "terrain_river_right_end";
    }
  }
  return "terrain_river_vertical";
}

/** Asphalt piece (`RoadLocation`); bridges count as road so crossings connect. */
export function roadTile(map: MapView, x: number, y: number): string {
  const c = cross(map, x, y);
  const paved = (t: string | undefined) => t === "road" || t === "bridge";
  const count = c.filter((t) => t === "road").length;

  if (count === 4) return "terrain_road_center";
  if (count === 3) {
    if (!paved(c[0])) return "terrain_road_t_bottom";
    if (!paved(c[1])) return "terrain_road_t_left";
    if (!paved(c[2])) return "terrain_road_t_top";
    if (!paved(c[3])) return "terrain_road_t_right";
  }
  if (count === 2) {
    const ends = pair(c, (t) => t === "road")!;
    const [i, j] = ends;
    const sum = i + j;
    if (sum === 1) return "terrain_road_turn_top_right";
    if (sum === 2) return "terrain_road_vertical";
    if (sum === 3) {
      return i === 0
        ? "terrain_road_turn_top_left"
        : "terrain_road_turn_bottom_right";
    }
    if (sum === 4) return "terrain_road_horizontal";
    if (sum === 5) return "terrain_road_turn_bottom_left";
  }
  if (count === 1) {
    return c[0] === "road" || c[2] === "road"
      ? "terrain_road_vertical"
      : "terrain_road_horizontal";
  }
  return "terrain_road_horizontal";
}

/** A bridge runs with the water it spans. */
export function bridgeTile(map: MapView, x: number, y: number): string {
  const c = cross(map, x, y);
  const water = (t: string | undefined) => t === "sea" || t === "river";
  return water(c[3]) || water(c[1])
    ? "terrain_bridge_horizontal"
    : "terrain_bridge_vertical";
}

/** The single tile a terrain falls back to, ignoring its neighbours. */
export function renderTileFor(terrainId: string): string {
  switch (terrainId) {
    case "sea":
      return "terrain_sea";
    case "reef":
      return "terrain_reef";
    case "shoal":
      return "terrain_beach_top";
    case "river":
      return "terrain_river_vertical";
    case "road":
      return "terrain_road_horizontal";
    case "bridge":
      return "terrain_bridge_horizontal";
    case "forest":
      return "terrain_forest";
    case "mountain":
      return "terrain_mountain";
    case "hill":
      return "terrain_hill";
    default:
      return "terrain_plain";
  }
}

/**
 * Build the bottom→top layer stack for one logical cell.
 *
 * Water, beach, river and road tiles are self-contained autotiles; features that
 * stand on grass (forest, mountain, hill, properties) stack over the plain fill,
 * and a plain tile west of a raised feature takes the pack's drop-shadow variant
 * so the relief reads.
 */
export function layersForCell(map: MapView, x: number, y: number): TileLayer[] {
  const terrainId = terrainAt(map, x, y) ?? "plain";

  switch (terrainId) {
    case "sea":
    case "reef": {
      const layers: TileLayer[] = [{ key: seaTile(map, x, y) }];
      layers.push(...seaCorners(map, x, y));
      if (terrainId === "reef") layers.push({ key: "terrain_reef" });
      return layers;
    }
    case "shoal":
      return [{ key: beachTile(map, x, y) }];
    case "river":
      return [{ key: riverTile(map, x, y) }];
    case "road":
      return [{ key: roadTile(map, x, y) }];
    case "bridge":
      return [{ key: bridgeTile(map, x, y) }];
    default:
      break;
  }

  // Land: grass, plus whatever stands on it.
  const raised = new Set(["forest", "mountain", "hill"]);
  const east = terrainAt(map, x + 1, y);
  const base: TileLayer = {
    key: raised.has(east ?? "") ? "terrain_plain_shadow" : "terrain_plain",
  };
  if (raised.has(terrainId)) {
    return [base, { key: renderTileFor(terrainId) }];
  }
  return [base];
}

/** True when the property layer draws a building over this cell. */
export function isPropertyTerrain(terrainId: string): boolean {
  return (
    terrainId === "city" ||
    terrainId === "base" ||
    terrainId === "airport" ||
    terrainId === "port" ||
    terrainId === "headquarters" ||
    terrainId === "silo"
  );
}

export { PROPERTY_BASE };

/**
 * Builds the ordered terrain render model for a map + fog view. Cells are
 * row-major (`y` outer, `x` inner); a cell outside the fog set renders under the
 * fog overlay.
 */
export function buildTerrainRenderModel(
  map: MapView,
  visibleTiles: readonly { readonly x: number; readonly y: number }[],
): TerrainCell[] {
  const visible = new Set(visibleTiles.map((t) => `${t.x},${t.y}`));
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
        renderTileId: layers[layers.length - 1]?.key ?? "terrain_plain",
        visible: visible.has(`${x},${y}`),
      });
    }
  }
  return cells;
}
