import type { FactionId } from "@/app/components/faction-badge";

/**
 * Pure sprite/tile-atlas mapping for the battlefield (M10-T1).
 *
 * The framework-free half of the render pipeline: it turns the data-backed §9.5
 * sprite-row mapping and the stable render-tile ids into pixel rectangles the
 * Phaser scene slices from the `game-assets/` atlases. Geometry is fixed by the
 * asset pack and the data conventions (`units.yaml` `conventions.asset_frame`/
 * `sprite_sheet`/`animation_columns`/`faction_sprite_sheets`; `terrain.yaml`
 * `conventions.tile_grid`), so it lives here as typed constants and is unit-tested
 * without a canvas. The §9.5 visual approval this consumes is recorded in
 * `docs/decisions/0003-battlefield-sprite-mapping-approval.md`.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T1)
 * @see docs/01-specification/game-specification.md §9.5
 */

/** Unit sprite frames are 32×32 (`units.yaml conventions.asset_frame`). */
export const UNIT_FRAME_PX = 32;
/** The faction sheets carry a 16px header strip before row 0. */
export const UNIT_SHEET_HEADER_PX = 16;
/** Each unit row is 32px tall (`units.yaml conventions.sprite_sheet`). */
export const UNIT_ROW_HEIGHT_PX = 32;
/** Terrain tiles are 24×24 (`terrain.yaml conventions.tile_grid`). */
export const TERRAIN_TILE_PX = 24;

/**
 * Animation → the sprite-sheet columns for its frames
 * (`units.yaml conventions.animation_columns`).
 */
export const ANIMATION_COLUMNS = {
  idle: [0, 1, 2, 3],
  move_side: [4, 5, 6, 7, 8],
  move_down: [9, 10, 11, 12],
  move_up: [13, 14, 15, 16],
  attack: [17, 18, 19, 20],
  hit: [21, 22, 23],
  death: [24, 25, 26, 27],
} as const satisfies Record<string, readonly number[]>;

export type UnitAnimation = keyof typeof ANIMATION_COLUMNS;

/** Faction → its unit sprite sheet (`units.yaml conventions.faction_sprite_sheets`). */
export const FACTION_SHEETS: Record<FactionId, string> = {
  blue: "blue-units-sprite-sheet.png",
  green: "green-units-sprite-sheet.png",
  red: "red-units-sprite-sheet.png",
  yellow: "yellow-units-sprite-sheet.png",
};

/** A pixel rectangle in a sprite atlas. */
export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The `rendering` shape as `game-data` parses it (submarine carries two rows). */
export type UnitRendering =
  | { readonly sprite_row: number }
  | {
      readonly sprite_rows: {
        readonly surfaced: number;
        readonly submerged: number;
      };
    };

/**
 * The sprite row for a unit, resolving the submarine's surfaced/submerged pair
 * (`game-specification.md` §19.5). `submerged` is ignored for single-row units.
 */
export function unitSpriteRow(
  rendering: UnitRendering,
  submerged = false,
): number {
  if ("sprite_rows" in rendering) {
    return submerged
      ? rendering.sprite_rows.submerged
      : rendering.sprite_rows.surfaced;
  }
  return rendering.sprite_row;
}

/** The atlas rectangle for one animation frame of a unit sprite row. */
export function unitFrame(
  spriteRow: number,
  animation: UnitAnimation,
  frameIndex = 0,
): FrameRect {
  const columns = ANIMATION_COLUMNS[animation];
  const column = columns[Math.min(frameIndex, columns.length - 1)];
  return {
    x: column * UNIT_FRAME_PX,
    y: UNIT_SHEET_HEADER_PX + spriteRow * UNIT_ROW_HEIGHT_PX,
    width: UNIT_FRAME_PX,
    height: UNIT_FRAME_PX,
  };
}

/** The full sprite-sheet path a faction's units are sliced from. */
export function factionSheetPath(faction: FactionId): string {
  return `/game-assets/units/${FACTION_SHEETS[faction]}`;
}

const RENDER_TILE_ID = /^terrain_r(\d+)_c(\d+)$/;

/**
 * The tileset rectangle for a stable render-tile id
 * (`terrain.yaml conventions.rendering.render_tile_id_format`,
 * `terrain_r{row}_c{column}`). Throws on a malformed id — the caller passes a
 * data-derived id, never user input.
 */
export function terrainTileFrame(renderTileId: string): FrameRect {
  const match = RENDER_TILE_ID.exec(renderTileId);
  if (match === null) {
    throw new Error(`Invalid render-tile id: ${renderTileId}`);
  }
  const row = Number(match[1]);
  const column = Number(match[2]);
  return {
    x: column * TERRAIN_TILE_PX,
    y: row * TERRAIN_TILE_PX,
    width: TERRAIN_TILE_PX,
    height: TERRAIN_TILE_PX,
  };
}
