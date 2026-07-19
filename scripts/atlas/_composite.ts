import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

import { ATLAS } from "../../app/lib/render/atlas.generated";
import { buildTerrainRenderModel } from "../../app/lib/render/terrain-map";
import { buildingTileId } from "../../app/lib/render/property-map";

/**
 * Off-screen board compositing, shared by the dev board dump (`_board.ts`) and
 * the map-thumbnail build (`scripts/build-map-thumbnails.ts`).
 *
 * It runs the **same pure render model the Phaser scene uses** —
 * `buildTerrainRenderModel` for autotiles, `buildingTileId` for the property
 * art — and blits the resulting atlas rectangles into a PNG. That is the whole
 * point: a thumbnail produced here is the board, not an impression of it.
 *
 * @see docs/decisions/0005-advance-wars-asset-pack.md
 */

/** Source tile size of the art pack, in pixels. */
export const TILE = 16;

const ASSETS = join(process.cwd(), "public/game-assets");

/** Which faction palette each map player slot composites in. */
export const SLOT_COLOR: Record<string, "red" | "blue"> = {
  player_1: "blue",
  player_2: "red",
};

/** The shape of an official map, as far as compositing cares. */
export interface CompositableMap {
  readonly dimensions: { readonly width: number; readonly height: number };
  readonly logical_terrain: readonly (readonly string[])[];
  readonly properties: readonly {
    readonly type_id: string;
    readonly x: number;
    readonly y: number;
    readonly initial_owner: string;
  }[];
  readonly starting_units: readonly {
    readonly type_id: string;
    readonly x: number;
    readonly y: number;
    readonly owner: string;
  }[];
}

/** An RGBA canvas of `width × height` tiles at `zoom`, with blit helpers. */
export class Compositor {
  readonly png: PNG;
  private readonly sheets = new Map<string, PNG>();

  constructor(
    readonly widthTiles: number,
    readonly heightTiles: number,
    readonly zoom: number,
    /** Fill color, or `null` for a transparent canvas. */
    background: readonly [number, number, number] | null,
  ) {
    this.png = new PNG({
      width: widthTiles * TILE * zoom,
      height: heightTiles * TILE * zoom,
    });
    const data = this.png.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = background?.[0] ?? 0;
      data[i + 1] = background?.[1] ?? 0;
      data[i + 2] = background?.[2] ?? 0;
      data[i + 3] = background === null ? 0 : 255;
    }
  }

  /** The decoded sheet for an asset path, cached across blits. */
  private sheet(file: string, faction = "blue"): PNG {
    const path = file.replace("{faction}", faction);
    const cached = this.sheets.get(path);
    if (cached !== undefined) return cached;
    const png = PNG.sync.read(readFileSync(join(ASSETS, path)));
    this.sheets.set(path, png);
    return png;
  }

  /** Copy a source rectangle to a destination pixel origin, alpha-keyed. */
  private copy(
    src: PNG,
    sx0: number,
    sy0: number,
    w: number,
    h: number,
    originX: number,
    originY: number,
  ): void {
    const dst = this.png;
    for (let y = 0; y < h * this.zoom; y++) {
      for (let x = 0; x < w * this.zoom; x++) {
        const sx = sx0 + Math.floor(x / this.zoom);
        const sy = sy0 + Math.floor(y / this.zoom);
        const si = (sy * src.width + sx) * 4;
        if (src.data[si + 3]! <= 8) continue;
        const px = originX + x;
        const py = originY + y;
        if (px < 0 || py < 0 || px >= dst.width || py >= dst.height) continue;
        const di = (py * dst.width + px) * 4;
        dst.data[di] = src.data[si]!;
        dst.data[di + 1] = src.data[si + 1]!;
        dst.data[di + 2] = src.data[si + 2]!;
        dst.data[di + 3] = 255;
      }
    }
  }

  /** Blit an atlas entry with its bottom-left corner at the given tile. */
  blit(key: string, tileX: number, tileY: number, dx = 0, dy = 0): void {
    const entry = ATLAS[key as keyof typeof ATLAS];
    if (entry === undefined) throw new Error(`missing atlas key: ${key}`);
    const src = this.sheet(entry.file);
    this.copy(
      src,
      entry.x,
      entry.y,
      entry.w,
      entry.h,
      (tileX * TILE + dx) * this.zoom,
      ((tileY + 1) * TILE - entry.h + dy) * this.zoom,
    );
  }

  /** Blit a unit frame, horizontally centered and bottom-aligned in its tile. */
  blitUnit(key: string, tileX: number, tileY: number, faction: string): void {
    const entry = ATLAS[key as keyof typeof ATLAS];
    if (entry === undefined) throw new Error(`missing atlas key: ${key}`);
    const src = this.sheet(entry.file, faction);
    this.copy(
      src,
      entry.x,
      entry.y,
      entry.w,
      entry.h,
      // Round: a half-pixel origin would shift the RGBA writes and scramble colors.
      Math.round((tileX * TILE + (TILE - entry.w) / 2) * this.zoom),
      Math.round(((tileY + 1) * TILE - entry.h) * this.zoom),
    );
  }

  /** Paint a solid rectangle, in source pixels. */
  fill(
    px: number,
    py: number,
    w: number,
    h: number,
    rgb: readonly [number, number, number],
  ): void {
    const dst = this.png;
    for (let y = 0; y < h * this.zoom; y++) {
      for (let x = 0; x < w * this.zoom; x++) {
        const di = ((py * this.zoom + y) * dst.width + px * this.zoom + x) * 4;
        dst.data[di] = rgb[0];
        dst.data[di + 1] = rgb[1];
        dst.data[di + 2] = rgb[2];
        dst.data[di + 3] = 255;
      }
    }
  }

  toBuffer(): Buffer {
    return PNG.sync.write(this.png);
  }
}

/**
 * Draw a map's terrain and properties (and optionally its starting units) into
 * a fresh compositor.
 */
export function compositeMap(
  map: CompositableMap,
  {
    zoom = 1,
    units = true,
    background = null as readonly [number, number, number] | null,
  } = {},
): Compositor {
  const compositor = new Compositor(
    map.dimensions.width,
    map.dimensions.height,
    zoom,
    background,
  );

  const view = {
    width: map.dimensions.width,
    height: map.dimensions.height,
    logicalTerrain: map.logical_terrain as string[][],
  };
  for (const cell of buildTerrainRenderModel(view, [])) {
    for (const layer of cell.layers) {
      compositor.blit(layer.key, cell.x, cell.y, layer.dx ?? 0, layer.dy ?? 0);
    }
  }

  // Properties in the owning slot's colors; unowned ones stay neutral.
  for (const property of map.properties) {
    const color = SLOT_COLOR[property.initial_owner] ?? null;
    compositor.blit(
      buildingTileId(property.type_id, color),
      property.x,
      property.y,
    );
  }

  if (units) {
    for (const unit of map.starting_units) {
      compositor.blitUnit(
        `unit_${unit.type_id}_idle_0`,
        unit.x,
        unit.y,
        SLOT_COLOR[unit.owner] ?? "blue",
      );
    }
  }

  return compositor;
}
