import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";

import { ATLAS } from "../../app/lib/render/atlas.generated";

/**
 * Dev helper: transcribe a map screenshot by matching every tile against our own
 * atlas. The reference shots come from the same rip as the art pack, so a tile
 * can be identified by rendering each candidate and comparing coarse color
 * blocks — far more reliable than reading a blurred screenshot by eye.
 *
 * `tsx scripts/atlas/_match-map.ts ref.png <pitch> <originX> <originY> <cols> <rows>`
 */

const [file, pitchArg, oxArg, oyArg, colsArg, rowsArg] = process.argv.slice(2);
const ref = PNG.sync.read(readFileSync(file!));
const pitch = Number(pitchArg);
const originX = Number(oxArg);
const originY = Number(oyArg);
const cols = Number(colsArg);
const rows = Number(rowsArg);
const ASSETS = join(process.cwd(), "public/game-assets");
const TILE = 16;
/** Coarse feature grid per tile: BLOCKS × BLOCKS mean colors. */
const BLOCKS = 4;

const sheets = new Map<string, PNG>();
function sheet(path: string): PNG {
  const cached = sheets.get(path);
  if (cached !== undefined) return cached;
  const png = PNG.sync.read(readFileSync(join(ASSETS, path)));
  sheets.set(path, png);
  return png;
}

/** Render a tile's atlas keys into a 16×16 RGB buffer (bottom-anchored). */
function renderTile(keys: readonly string[]): Uint8Array {
  const out = new Uint8Array(TILE * TILE * 3);
  for (const key of keys) {
    const entry = ATLAS[key as keyof typeof ATLAS];
    if (entry === undefined) throw new Error(`missing key ${key}`);
    const src = sheet(entry.file.replace("{faction}", "blue"));
    // Tall sprites hang above their tile; only the bottom 16 rows land in it.
    const skip = Math.max(0, entry.h - TILE);
    for (let y = skip; y < entry.h; y++) {
      for (let x = 0; x < entry.w && x < TILE; x++) {
        const si = ((entry.y + y) * src.width + entry.x + x) * 4;
        if (src.data[si + 3]! <= 8) continue;
        const di = ((y - skip) * TILE + x) * 3;
        out[di] = src.data[si]!;
        out[di + 1] = src.data[si + 1]!;
        out[di + 2] = src.data[si + 2]!;
      }
    }
  }
  return out;
}

/** BLOCKS×BLOCKS mean colors of a 16×16 RGB buffer. */
function featuresOfTile(buffer: Uint8Array): number[] {
  const step = TILE / BLOCKS;
  const features: number[] = [];
  for (let by = 0; by < BLOCKS; by++) {
    for (let bx = 0; bx < BLOCKS; bx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = by * step; y < (by + 1) * step; y++) {
        for (let x = bx * step; x < (bx + 1) * step; x++) {
          const i = (y * TILE + x) * 3;
          r += buffer[i]!;
          g += buffer[i + 1]!;
          b += buffer[i + 2]!;
        }
      }
      const n = step * step;
      features.push(r / n, g / n, b / n);
    }
  }
  return features;
}

/** BLOCKS×BLOCKS mean colors of one screenshot tile. */
function featuresOfRef(col: number, row: number): number[] {
  const x0 = originX + col * pitch;
  const y0 = originY + row * pitch;
  const step = pitch / BLOCKS;
  const features: number[] = [];
  for (let by = 0; by < BLOCKS; by++) {
    for (let bx = 0; bx < BLOCKS; bx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = Math.round(y0 + by * step); y < y0 + (by + 1) * step; y++) {
        for (
          let x = Math.round(x0 + bx * step);
          x < x0 + (bx + 1) * step;
          x++
        ) {
          if (x < 0 || y < 0 || x >= ref.width || y >= ref.height) continue;
          const i = (y * ref.width + x) * 4;
          r += ref.data[i]!;
          g += ref.data[i + 1]!;
          b += ref.data[i + 2]!;
          n++;
        }
      }
      if (n === 0) return [];
      features.push(r / n, g / n, b / n);
    }
  }
  return features;
}

/** Candidate tiles: every terrain autotile, plus properties over grass. */
const candidates: { label: string; features: number[] }[] = [];
for (const key of Object.keys(ATLAS)) {
  if (key.startsWith("terrain_")) {
    const overlay = /forest|mountain|hill/.test(key);
    candidates.push({
      label: key.replace("terrain_", ""),
      features: featuresOfTile(
        renderTile(overlay ? ["terrain_plain", key] : [key]),
      ),
    });
  }
  if (key.startsWith("building_") && key.endsWith("_0")) {
    candidates.push({
      label: key.replace("building_", "P:").replace("_0", ""),
      features: featuresOfTile(renderTile(["terrain_plain", key])),
    });
  }
}

const distance = (a: number[], b: number[]): number =>
  a.reduce((sum, v, i) => sum + (v - b[i]!) ** 2, 0);

console.log(
  `matching ${cols}×${rows} tiles against ${candidates.length} candidates`,
);
for (let row = 0; row < rows; row++) {
  const cells: string[] = [];
  for (let col = 0; col < cols; col++) {
    const features = featuresOfRef(col, row);
    if (features.length === 0) {
      cells.push("?");
      continue;
    }
    const ranked = candidates
      .map((c) => ({ label: c.label, d: distance(features, c.features) }))
      .sort((a, b) => a.d - b.d);
    const best = ranked[0]!;
    const second = ranked[1]!;
    cells.push(
      process.env.DETAIL
        ? `${col}:${best.label}(${Math.round(best.d / 1000)})/${second.label}`
        : best.label,
    );
  }
  console.log(
    String(row).padStart(2),
    cells.join(process.env.DETAIL ? "  " : " | "),
  );
}
