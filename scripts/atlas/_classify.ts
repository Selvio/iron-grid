import { readFileSync } from "node:fs";
import { PNG } from "pngjs";

/**
 * Classify every tile of an Advance-Wars map screenshot.
 *
 * The reference palette is small and exactly quantized, so terrain reads off a
 * color histogram. Buildings are harder: type is carried by the sprite *shape*,
 * owner by its color ramp. Two buildings of the same type in different colors
 * have the same silhouette, so we cluster tiles by a color-rank mask — that
 * collapses every building in the map to a handful of shapes to name by eye.
 */

const file = process.argv[2]!;
const png = PNG.sync.read(readFileSync(file));
const TILE = 16;
const cols = png.width / TILE;
const rows = png.height / TILE;

const rgbAt = (x: number, y: number): string => {
  const i = (y * png.width + x) * 4;
  return `${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`;
};

/** Building ramps: the dominant body color of each owner. */
const OWNER: Record<string, string> = {
  "208,64,56": "red",
  "112,96,232": "blue",
  "192,184,192": "neutral",
};

/** Terrain marker colors. */
const PLAIN = new Set(["192,224,48", "216,232,32"]);
const ROAD = new Set([
  "152,160,184",
  "176,184,192",
  "208,216,200",
  "104,128,136",
]);
const SEA = new Set([
  "112,88,248",
  "96,144,248",
  "88,64,200",
  "176,96,152",
  "144,72,176",
  "80,48,160",
]);
const TREE = new Set(["72,176,152", "88,160,152", "64,144,128"]);
const PEAK = new Set(["248,232,88", "232,176,72", "248,200,72"]);
/** The beach sand ramp. `248,240,192` is NOT here — that is a neutral
 * building's highlight, and including it made every neutral city read as sand. */
const SHOAL = new Set([
  "248,224,72",
  "240,168,32",
  "248,208,56",
  "248,216,120",
]);
/** The bridge deck's railing trim — it appears on no other road tile. */
const RAILING = new Set(["128,112,192", "96,104,120"]);

interface Tile {
  x: number;
  y: number;
  hist: Map<string, number>;
  mask: string;
  owner: string | null;
  guess: string;
}

const tiles: Tile[] = [];
for (let ty = 0; ty < rows; ty++) {
  for (let tx = 0; tx < cols; tx++) {
    const hist = new Map<string, number>();
    for (let y = ty * TILE; y < ty * TILE + TILE; y++) {
      for (let x = tx * TILE; x < tx * TILE + TILE; x++) {
        const k = rgbAt(x, y);
        hist.set(k, (hist.get(k) ?? 0) + 1);
      }
    }
    const ranked = [...hist].sort((a, b) => b[1] - a[1]);
    const owner =
      ranked.map(([k]) => OWNER[k]).find((o) => o !== undefined) ?? null;

    // Shape mask: which pixels are NOT background plain/sea, as a bitmap.
    let mask = "";
    for (let y = ty * TILE; y < ty * TILE + TILE; y++) {
      for (let x = tx * TILE; x < tx * TILE + TILE; x++) {
        const k = rgbAt(x, y);
        mask += PLAIN.has(k) || SEA.has(k) ? "0" : "1";
      }
    }

    const count = (set: Set<string>) =>
      ranked.reduce((n, [k, v]) => (set.has(k) ? n + v : n), 0);
    const plain = count(PLAIN);
    const road = count(ROAD);
    const sea = count(SEA);
    const tree = count(TREE);
    const peak = count(PEAK);
    const shoal = count(SHOAL);
    const railing = count(RAILING);

    let guess: string;
    if (owner !== null) guess = `BUILD:${owner}`;
    // The deck hides most of the water it spans, so a bridge is identified by
    // its railing trim, not by the sea underneath.
    else if (railing > 20 && road > 40) guess = "bridge";
    // Sand before sea: a beach tile still carries plenty of shallow water.
    else if (shoal > 45) guess = "shoal";
    else if (sea > 120) guess = "sea";
    else if (road > 110) guess = "road";
    else if (sea > 40) guess = "sea-edge";
    else if (peak > 12) guess = "mountain";
    else if (tree > 25) guess = "forest";
    else if (plain > 150) guess = "plain";
    else guess = "?";

    tiles.push({ x: tx, y: ty, hist, mask, owner, guess });
  }
}

if (process.env.MODE === "shapes") {
  // Cluster building tiles by silhouette so each distinct type shows up once.
  const byMask = new Map<string, Tile[]>();
  for (const t of tiles) {
    if (t.owner === null) continue;
    const list = byMask.get(t.mask) ?? [];
    list.push(t);
    byMask.set(t.mask, list);
  }
  const clusters = [...byMask.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  console.log(`${clusters.length} distinct building silhouettes`);
  for (const [, list] of clusters) {
    const owners = new Set(list.map((t) => t.owner));
    console.log(
      `\n#${clusters.findIndex(([, l]) => l === list)} ×${list.length} owners=${[...owners].join("/")}`,
    );
    console.log(`  at ${list.map((t) => `${t.x},${t.y}`).join("  ")}`);
    // ASCII silhouette of the first instance.
    const m = list[0]!.mask;
    for (let r = 0; r < TILE; r++) {
      console.log(
        "   " + m.slice(r * TILE, r * TILE + TILE).replace(/0/g, "."),
      );
    }
  }
} else if (process.env.MODE === "csv") {
  for (let ty = 0; ty < rows; ty++) {
    console.log(
      tiles
        .filter((t) => t.y === ty)
        .map((t) => t.guess)
        .join(","),
    );
  }
} else {
  for (let ty = 0; ty < rows; ty++) {
    const row = tiles
      .filter((t) => t.y === ty)
      .map((t) => t.guess.padEnd(14))
      .join("");
    console.log(String(ty).padStart(2), row);
  }
}
