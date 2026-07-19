import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

/**
 * Dev helper: report where a map screenshot's coastline steps, so the tile pitch
 * and grid origin can be derived from it. `tsx scripts/atlas/_edge.ts ref.png`
 */

const png = PNG.sync.read(readFileSync(process.argv[2]!));

const isSea = (x: number, y: number): boolean => {
  const i = (y * png.width + x) * 4;
  const r = png.data[i]!;
  const g = png.data[i + 1]!;
  const b = png.data[i + 2]!;
  return b > 140 && b - r > 50 && b - g > 40;
};

/** First column of each row that stops being sea, scanning from the first sea pixel. */
const steps = new Map<number, number>();
for (let y = 0; y < png.height; y++) {
  let x = 0;
  while (x < png.width && !isSea(x, y)) x++; // skip the screenshot frame
  if (x >= png.width) continue;
  while (x < png.width && isSea(x, y)) x++;
  steps.set(x, (steps.get(x) ?? 0) + 1);
}
const common = [...steps.entries()]
  .filter(([, count]) => count > 8)
  .sort((a, b) => a[0] - b[0]);
console.log("left coastline columns (px → rows):");
console.log(common.map(([x, n]) => `${x}(${n})`).join(" "));
const xs = common.map(([x]) => x);
console.log(
  "gaps:",
  xs
    .slice(1)
    .map((x, i) => x - xs[i]!)
    .join(" "),
);
