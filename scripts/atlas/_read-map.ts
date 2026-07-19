import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

/**
 * Dev helper: classify every tile of a map screenshot into a terrain guess, as
 * a first pass at transcribing a reference map. The output is a starting point
 * to correct by eye, not an authority — buildings in particular only report
 * "structure" plus their dominant color.
 *
 * `tsx scripts/atlas/_read-map.ts ref.png <pitch> <originX> <originY> <cols> <rows>`
 */

const [file, pitchArg, oxArg, oyArg, colsArg, rowsArg] = process.argv.slice(2);
const png = PNG.sync.read(readFileSync(file!));
const pitch = Number(pitchArg);
const originX = Number(oxArg);
const originY = Number(oyArg);
const cols = Number(colsArg);
const rows = Number(rowsArg);

type Bucket =
  | "sea"
  | "grass"
  | "road"
  | "tree"
  | "mountain"
  | "white"
  | "red"
  | "blue"
  | "sand"
  | "rock"
  | "other";

function bucket(r: number, g: number, b: number): Bucket {
  if (b > 180 && r < 130 && g < 150) return "sea";
  if (g > 170 && r > 130 && b < 120) return "grass";
  if (r > 200 && g > 200 && b > 200) return "white";
  if (r > 170 && g < 110 && b < 110) return "red";
  if (b > 150 && r > 90 && r < 180 && g < 130) return "blue";
  if (g > 120 && b > 150 && r < 120) return "tree";
  if (r > 190 && g > 140 && b < 110) return "sand";
  if (r > 120 && b > 110 && g < 120) return "rock";
  if (g > 140 && r > 90 && r < 190 && b < 150) return "mountain";
  if (Math.abs(r - g) < 30 && Math.abs(g - b) < 40 && r > 110 && r < 210)
    return "road";
  return "other";
}

/** Share of each bucket inside one tile. */
function profile(col: number, row: number): Map<Bucket, number> {
  const counts = new Map<Bucket, number>();
  let total = 0;
  const x0 = originX + col * pitch;
  const y0 = originY + row * pitch;
  for (let y = y0 + 6; y < y0 + pitch - 6; y += 3) {
    for (let x = x0 + 6; x < x0 + pitch - 6; x += 3) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      const i = (y * png.width + x) * 4;
      const key = bucket(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      total++;
    }
  }
  for (const [key, n] of counts) counts.set(key, n / Math.max(1, total));
  return counts;
}

const CHAR: Record<string, string> = {
  sea: "~",
  grass: ".",
  road: "=",
  tree: "T",
  mountain: "M",
  white: "C", // white structure — city / neutral building
  red: "R", // red-owned structure
  blue: "B", // blue-owned structure
  sand: "s",
  rock: "c",
  other: "?",
};

console.log(
  `${cols}×${rows} tiles at ${pitch}px from (${originX}, ${originY})`,
);
for (let row = 0; row < rows; row++) {
  let line = "";
  const detail: string[] = [];
  for (let col = 0; col < cols; col++) {
    const p = profile(col, row);
    const ranked = [...p.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked[0]?.[0] ?? "other";
    line += CHAR[top] ?? "?";
    detail.push(
      `${col}:${ranked
        .slice(0, 3)
        .map(([k, v]) => `${k}${Math.round(v * 100)}`)
        .join(",")}`,
    );
  }
  console.log(String(row).padStart(2), line);
  if (process.env.DETAIL) console.log("     ", detail.join(" | "));
}
