/**
 * Logical terrain → a flat swatch color, for map thumbnails (M9-T10).
 *
 * This is **not** the battlefield renderer. The board draws the approved art
 * pack through the atlas (`terrain-map.ts`, ADR-0005); a thumbnail needs one
 * color per cell so a map reads at 100×60 pixels, in the DOM, with no canvas
 * and no asset load — which also keeps it assertable under jsdom.
 *
 * `terrain.yaml` carries no color field (it is rules data, not art), so the
 * palette lives here: a deliberate, minimal reading of each terrain group —
 * water blue, ground green, roads grey, buildings pale, and the headquarters
 * gold because it is the win condition and a player scanning a thumbnail is
 * looking for the two starts. Ownership is **not** shown: `logical_terrain`
 * has none, and a thumbnail must not imply a side.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T10)
 * @see docs/02-data/terrain.yaml (the terrain ids this maps)
 */

/** Every terrain id in `terrain.yaml`, plus a fallback for anything new. */
const SWATCH: Readonly<Record<string, string>> = {
  // Water.
  sea: "#4a86c8",
  reef: "#3f6f9e",
  river: "#6aa8dd",
  shoal: "#e8dcae",
  // Ground.
  plain: "#8ec457",
  forest: "#3f8a44",
  mountain: "#9a7f5f",
  // Built.
  road: "#c6c0b2",
  bridge: "#b08d57",
  city: "#e2ddd1",
  base: "#bdb6a8",
  airport: "#d3d9e0",
  port: "#a9c4d8",
  headquarters: "#f0c04a",
  missile_silo: "#a7aeb8",
  used_missile_silo: "#8d949e",
  pipe: "#7d8794",
  pipe_seam: "#8a94a1",
  broken_pipe_seam: "#6f7986",
};

/** The fallback for a terrain id this palette does not know yet. */
const UNKNOWN = "#9aa3ad";

/** The swatch color for one logical terrain id. */
export function terrainSwatch(terrainId: string): string {
  return SWATCH[terrainId] ?? UNKNOWN;
}
