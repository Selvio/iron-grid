import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

import { ATLAS } from "../../app/lib/render/atlas.generated";

/**
 * Dev helper: render a contact sheet PNG of the atlas entries matching a key
 * prefix, one clip per row, so the generated rectangles can be eyeballed without
 * a browser. `tsx scripts/atlas/_sheet.ts unit_ out.png [zoom]`
 */

const prefix = process.argv[2] ?? "";
const out = process.argv[3] ?? "atlas-sheet.png";
const zoom = Number(process.argv[4] ?? 3);
const CELL = 34;
const ASSETS = join(process.cwd(), "public/game-assets");

const sheets = new Map<string, PNG>();
function sheet(file: string): PNG {
  const path = file.replace("{faction}", "blue");
  const cached = sheets.get(path);
  if (cached !== undefined) return cached;
  const png = PNG.sync.read(readFileSync(join(ASSETS, path)));
  sheets.set(path, png);
  return png;
}

/** Group keys by everything before the trailing frame index. */
const rows = new Map<string, string[]>();
for (const key of Object.keys(ATLAS)) {
  if (!key.startsWith(prefix)) continue;
  const clip = key.replace(/_\d+$/, "");
  rows.set(clip, [...(rows.get(clip) ?? []), key]);
}

const clips = [...rows.keys()].sort();
const columns = Math.max(...clips.map((c) => rows.get(c)!.length), 1);
const dst = new PNG({
  width: columns * CELL * zoom,
  height: clips.length * CELL * zoom,
});
// Checkerboard so transparent margins and mis-cropped frames stand out.
for (let y = 0; y < dst.height; y++) {
  for (let x = 0; x < dst.width; x++) {
    const i = (y * dst.width + x) * 4;
    const dark = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
    dst.data[i] = dark ? 26 : 38;
    dst.data[i + 1] = dark ? 30 : 44;
    dst.data[i + 2] = dark ? 40 : 56;
    dst.data[i + 3] = 255;
  }
}

clips.forEach((clip, row) => {
  rows.get(clip)!.forEach((key, column) => {
    const entry = ATLAS[key as keyof typeof ATLAS];
    const src = sheet(entry.file);
    const originX = column * CELL * zoom;
    const originY = row * CELL * zoom;
    for (let dy = 0; dy < entry.h * zoom; dy++) {
      for (let dx = 0; dx < entry.w * zoom; dx++) {
        const sx = entry.x + Math.floor(dx / zoom);
        const sy = entry.y + Math.floor(dy / zoom);
        const si = (sy * src.width + sx) * 4;
        if (src.data[si + 3]! <= 8) continue;
        const di = ((originY + dy) * dst.width + originX + dx) * 4;
        dst.data[di] = src.data[si]!;
        dst.data[di + 1] = src.data[si + 1]!;
        dst.data[di + 2] = src.data[si + 2]!;
        dst.data[di + 3] = 255;
      }
    }
  });
});

writeFileSync(out, PNG.sync.write(dst));
console.log(`${clips.length} clips × up to ${columns} frames → ${out}`);
clips.forEach((clip, i) => console.log(`row ${i}: ${clip}`));
