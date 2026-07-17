import type { MapView } from "@/app/server/actions/read";

/**
 * Logical-terrain → render-tile mapping and the terrain render model (M10-T2).
 *
 * `MatchView` carries the public map layout (`map.logicalTerrain`) and the fog
 * map (`visibleTiles`); the terrain itself is never fog-hidden — only units are
 * (`game-specification.md` §18). This module turns that into a flat, ordered list
 * of cells the Phaser scene draws, keeping the logical-vs-render tile separation
 * (`frontend.md` §7.4): it reasons about `logicalTerrain` and emits a stable
 * `renderTileId` (`terrain_r{row}_c{column}`) plus the per-cell fog flag.
 *
 * `BASE_TERRAIN_TILE` is the base atlas assignment for the 7 confirmed terrains
 * (ADR-0003). The exact tileset coordinates are **provisional** and confirmed
 * visually against `tileset.png` in M12 (the canvas is verified manually); the
 * pure model built here — cell order, tile lookup, fog flag — does not depend on
 * the exact coordinates and is unit-tested.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T2)
 */

/** Base render tile per confirmed logical terrain (`terrain.yaml`; ADR-0003). */
export const BASE_TERRAIN_TILE: Record<string, string> = {
  plain: "terrain_r00_c00",
  forest: "terrain_r02_c07",
  mountain: "terrain_r04_c07",
  road: "terrain_r08_c02",
  river: "terrain_r06_c02",
  sea: "terrain_r10_c07",
  shoal: "terrain_r09_c02",
};

/** The render tile for a logical terrain; falls back to plain for the unmapped. */
export function renderTileFor(terrainId: string): string {
  return BASE_TERRAIN_TILE[terrainId] ?? BASE_TERRAIN_TILE.plain;
}

export interface TerrainCell {
  readonly x: number;
  readonly y: number;
  readonly terrainId: string;
  readonly renderTileId: string;
  /** Whether the viewer currently sees this tile (drives the fog overlay). */
  readonly visible: boolean;
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
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
      const terrainId = map.logicalTerrain[y]?.[x] ?? "plain";
      cells.push({
        x,
        y,
        terrainId,
        renderTileId: renderTileFor(terrainId),
        visible: visible.has(tileKey(x, y)),
      });
    }
  }
  return cells;
}
