import { writeFileSync } from "node:fs";

import { loadGameData } from "game-data";

import { compositeMap, TILE, type CompositableMap } from "./_composite";

/**
 * Dev helper: composite an official map into a PNG with the same pure render
 * model the scene uses, so the autotiles and building art can be reviewed
 * without a browser. `tsx scripts/atlas/_board.ts <map-id> out.png [zoom]`
 *
 * The compositing itself lives in `_composite.ts`, shared with the thumbnail
 * build (`scripts/build-map-thumbnails.ts`).
 */

const [mapId = "spann-island", out = "board.png", zoomArg] =
  process.argv.slice(2);
const zoom = Number(zoomArg ?? 3);

const gameData = loadGameData();
const map = gameData.maps[mapId];
if (map === undefined) throw new Error(`unknown map: ${mapId}`);

const width = map.dimensions.width;
const height = map.dimensions.height;

const compositor = compositeMap(map as unknown as CompositableMap, {
  zoom,
  units: true,
  // The scene's board background, so overhanging art reads the way it will.
  background: [13, 17, 23],
});

/**
 * `CAPTURE="x,y,pointsRemaining"` also draws an infantry standing on that tile
 * with the capture read-out over it, to check the indicator stays legible under
 * the unit that is doing the capturing.
 */
const captureDemo = process.env.CAPTURE;
if (captureDemo !== undefined) {
  const [cx, cy, remaining] = captureDemo.split(",").map(Number);
  compositor.blitUnit("unit_infantry_idle_0", cx!, cy!, "red");

  // Mirrors the scene's capture bar: a slim outlined track floating above the
  // tile, filled to the capture's progress.
  const progress = (20 - remaining!) / 20;
  const barY = cy! * TILE - 5;
  compositor.fill(cx! * TILE + 1, barY, TILE - 2, 4, [242, 86, 91]);
  compositor.fill(cx! * TILE + 2, barY + 1, TILE - 4, 2, [13, 17, 23]);
  compositor.fill(
    cx! * TILE + 2,
    barY + 1,
    Math.max(1, Math.round((TILE - 4) * progress)),
    2,
    [242, 86, 91],
  );
  console.log(`capture demo at ${cx},${cy} (${remaining} points left)`);
}

writeFileSync(out, compositor.toBuffer());
console.log(`${mapId} ${width}×${height} → ${out}`);
