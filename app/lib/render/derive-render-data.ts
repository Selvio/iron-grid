import type { FactionId } from "@/app/components/faction-badge";

import { atlasEntry, atlasUrl, keysWithPrefix, type AtlasEntry } from "./atlas";

/**
 * Battlefield sprite geometry (M10-T1, re-based on the atlas in M12).
 *
 * The framework-free half of the render pipeline: it answers "which rectangle of
 * which file draws this?" for terrain tiles and unit animation frames, so the
 * Phaser scene and the DOM crops share one source of truth. All geometry comes
 * from `atlas.generated.ts` (`pnpm atlas`) — the art pack has no uniform grid,
 * so there is no row/column arithmetic left to do here.
 *
 * @see docs/decisions/0005-advance-wars-asset-pack.md
 * @see docs/01-specification/game-specification.md §9.5
 */

/** Terrain tiles are 16×16 (`terrain.yaml conventions.tile_grid`). */
export const TERRAIN_TILE_PX = 16;

/**
 * The animations the pack provides for map units. Advance Wars animates combat
 * in a separate scene, so the map sprites carry movement only — attack, hit and
 * death are expressed with effects and tweens instead (`animation-plan.ts`).
 */
export const UNIT_ANIMATIONS = [
  "idle",
  "move_side",
  "move_up",
  "move_down",
] as const;

export type UnitAnimation = (typeof UNIT_ANIMATIONS)[number];

/** A pixel rectangle in a sprite atlas. */
export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The `rendering` shape as `game-data` parses it (submarine carries two keys). */
export type UnitRendering =
  | { readonly sprite_key: string }
  | {
      readonly sprite_keys: {
        readonly surfaced: string;
        readonly submerged: string;
      };
    };

/**
 * The sprite key for a unit, resolving the submarine's surfaced/submerged pair
 * (`game-specification.md` §19.5). `submerged` is ignored for single-key units.
 */
export function unitSpriteKey(
  rendering: UnitRendering,
  submerged = false,
): string {
  if ("sprite_keys" in rendering) {
    return submerged
      ? rendering.sprite_keys.submerged
      : rendering.sprite_keys.surfaced;
  }
  return rendering.sprite_key;
}

const asRect = (entry: AtlasEntry): FrameRect => ({
  x: entry.x,
  y: entry.y,
  width: entry.w,
  height: entry.h,
});

/** How many frames the pack has for a clip (0 when it has none). */
export function frameCount(
  spriteKey: string,
  animation: UnitAnimation,
): number {
  return keysWithPrefix(`unit_${spriteKey}_${animation}_`).length;
}

/**
 * The atlas rectangle for one animation frame of a unit.
 *
 * Frame indexes past the clip's end clamp to its last frame, and a clip the pack
 * never drew (most air and naval units only have an idle) falls back to idle —
 * a unit is never left without a sprite because of a missing animation.
 */
export function unitFrame(
  spriteKey: string,
  animation: UnitAnimation = "idle",
  frameIndex = 0,
): FrameRect {
  const available = frameCount(spriteKey, animation);
  const clip = available > 0 ? animation : "idle";
  const count = available > 0 ? available : frameCount(spriteKey, "idle");
  if (count === 0) {
    throw new Error(`No sprite frames for unit "${spriteKey}"`);
  }
  const index = Math.min(Math.max(frameIndex, 0), count - 1);
  return asRect(atlasEntry(`unit_${spriteKey}_${clip}_${index}`)!);
}

/** The sheet URL a unit's frames are cut from, for the owning faction. */
export function factionSheetPath(
  faction: FactionId,
  spriteKey = "infantry",
): string {
  const entry = atlasEntry(`unit_${spriteKey}_idle_0`);
  if (entry === null)
    throw new Error(`No sprite sheet for unit "${spriteKey}"`);
  return atlasUrl(entry, faction);
}

/**
 * The atlas rectangle for a render-tile key (`terrain_*`, `building_*`).
 * Throws on an unknown key — callers pass data-derived keys, never user input.
 */
export function terrainTileFrame(renderTileId: string): FrameRect {
  const entry = atlasEntry(renderTileId);
  if (entry === null) {
    throw new Error(`Invalid render-tile id: ${renderTileId}`);
  }
  return asRect(entry);
}

/** The file a render tile is cut from, as a public URL. */
export function terrainTileUrl(renderTileId: string): string {
  const entry = atlasEntry(renderTileId);
  if (entry === null) {
    throw new Error(`Invalid render-tile id: ${renderTileId}`);
  }
  return atlasUrl(entry);
}
