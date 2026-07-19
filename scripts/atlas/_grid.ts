import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

/**
 * Dev helper: find the tile pitch of a screenshot by autocorrelation, and write
 * a copy with a tile grid drawn over it so a map can be transcribed by eye.
 *
 * `tsx scripts/atlas/_grid.ts ref.png out.png [pitch] [originX] [originY]`
 */

const [file, out, pitchArg, oxArg, oyArg] = process.argv.slice(2);
const png = PNG.sync.read(readFileSync(file!));

/** Mean absolute difference between the image and itself shifted by `dx`. */
function rowDiff(shift: number): number {
  let total = 0;
  let count = 0;
  for (let y = 0; y < png.height; y += 3) {
    for (let x = 0; x + shift < png.width; x += 2) {
      const a = (y * png.width + x) * 4;
      const b = (y * png.width + x + shift) * 4;
      total +=
        Math.abs(png.data[a]! - png.data[b]!) +
        Math.abs(png.data[a + 1]! - png.data[b + 1]!) +
        Math.abs(png.data[a + 2]! - png.data[b + 2]!);
      count++;
    }
  }
  return total / count;
}

let pitch = Number(pitchArg ?? 0);
if (!pitch) {
  let best = Infinity;
  for (let shift = 30; shift <= 90; shift++) {
    const score = rowDiff(shift);
    if (score < best) {
      best = score;
      pitch = shift;
    }
  }
  console.log(`best pitch ≈ ${pitch}px (score ${best.toFixed(1)})`);
  for (const s of [pitch, pitch * 2, Math.round(pitch / 2)]) {
    console.log(`  shift ${s}: ${rowDiff(s).toFixed(1)}`);
  }
}

const originX = Number(oxArg ?? 0);
const originY = Number(oyArg ?? 0);
console.log(
  `grid: ${((png.width - originX) / pitch).toFixed(2)} × ${((png.height - originY) / pitch).toFixed(2)} tiles at ${pitch}px`,
);

if (out !== undefined) {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const onLine = (x - originX) % pitch === 0 || (y - originY) % pitch === 0;
      if (!onLine) continue;
      const i = (y * png.width + x) * 4;
      png.data[i] = 255;
      png.data[i + 1] = 0;
      png.data[i + 2] = 255;
    }
  }
  writeFileSync(out, PNG.sync.write(png));
  console.log(`grid overlay → ${out}`);
}
