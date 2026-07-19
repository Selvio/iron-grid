import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

import { ATLAS } from "../../app/lib/render/atlas.generated";
import { buildTerrainRenderModel } from "../../app/lib/render/terrain-map";
import { buildingTileId } from "../../app/lib/render/property-map";
import { loadGameData } from "game-data";

/**
 * Dev helper: composite an official map into a PNG with the same pure render
 * model the scene uses, so the autotiles and building art can be reviewed
 * without a browser. `tsx scripts/atlas/_board.ts <map-id> out.png [zoom]`
 */

const TILE = 16;
const [mapId = "crossfire-basin", out = "board.png", zoomArg] =
  process.argv.slice(2);
const zoom = Number(zoomArg ?? 3);
const ASSETS = join(process.cwd(), "public/game-assets");

const gameData = loadGameData();
const map = gameData.maps[mapId];
if (map === undefined) throw new Error(`unknown map: ${mapId}`);

const width = map.dimensions.width;
const height = map.dimensions.height;
const view = {
  width,
  height,
  logicalTerrain: map.logical_terrain as string[][],
};

const sheets = new Map<string, PNG>();
function sheet(file: string): PNG {
  const path = file.replace("{faction}", "blue");
  const cached = sheets.get(path);
  if (cached !== undefined) return cached;
  const png = PNG.sync.read(readFileSync(join(ASSETS, path)));
  sheets.set(path, png);
  return png;
}

const dst = new PNG({
  width: width * TILE * zoom,
  height: height * TILE * zoom,
});
for (let i = 0; i < dst.data.length; i += 4) {
  dst.data[i] = 13;
  dst.data[i + 1] = 17;
  dst.data[i + 2] = 23;
  dst.data[i + 3] = 255;
}

/** Blit an atlas entry with its bottom-left corner at the given tile pixel. */
function blit(key: string, tileX: number, tileY: number, dx = 0, dy = 0): void {
  const entry = ATLAS[key as keyof typeof ATLAS];
  if (entry === undefined) throw new Error(`missing atlas key: ${key}`);
  const src = sheet(entry.file);
  const originX = (tileX * TILE + dx) * zoom;
  const originY = ((tileY + 1) * TILE - entry.h + dy) * zoom;
  for (let y = 0; y < entry.h * zoom; y++) {
    for (let x = 0; x < entry.w * zoom; x++) {
      const sx = entry.x + Math.floor(x / zoom);
      const sy = entry.y + Math.floor(y / zoom);
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

for (const cell of buildTerrainRenderModel(view, [])) {
  for (const layer of cell.layers) {
    blit(layer.key, cell.x, cell.y, layer.dx ?? 0, layer.dy ?? 0);
  }
}

// Properties in the owning slot's colors; unowned ones stay neutral.
const SLOT_COLOR: Record<string, "red" | "blue"> = {
  player_1: "blue",
  player_2: "red",
};
for (const property of map.properties as {
  type_id: string;
  x: number;
  y: number;
  initial_owner: string;
}[]) {
  const color = SLOT_COLOR[property.initial_owner] ?? null;
  blit(buildingTileId(property.type_id, color), property.x, property.y);
}

for (const unit of map.starting_units as {
  type_id: string;
  x: number;
  y: number;
  owner: string;
}[]) {
  const entry = ATLAS[`unit_${unit.type_id}_idle_0` as keyof typeof ATLAS];
  const file = entry.file.replace(
    "{faction}",
    SLOT_COLOR[unit.owner] ?? "blue",
  );
  const src = sheet(file);
  // Round: a half-pixel origin would shift the RGBA writes and scramble colors.
  const originX = Math.round((unit.x * TILE + (TILE - entry.w) / 2) * zoom);
  const originY = Math.round(((unit.y + 1) * TILE - entry.h) * zoom);
  for (let y = 0; y < entry.h * zoom; y++) {
    for (let x = 0; x < entry.w * zoom; x++) {
      const si =
        ((entry.y + Math.floor(y / zoom)) * src.width +
          entry.x +
          Math.floor(x / zoom)) *
        4;
      if (src.data[si + 3]! <= 8) continue;
      const di = ((originY + y) * dst.width + originX + x) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = 255;
    }
  }
}

writeFileSync(out, PNG.sync.write(dst));
console.log(`${mapId} ${width}×${height} → ${out}`);
