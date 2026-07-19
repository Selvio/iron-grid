import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  bands,
  boxAt,
  detectSprites,
  readSheet,
  type Box,
} from "./atlas/detect";
import {
  BUILDINGS,
  EXPLOSION_TOPS,
  HUD,
  PATH,
  SILO_SPENT,
  SPLASH_TOPS,
  SUBMERGED_ALIAS,
  TERRAIN,
  TERRAIN_OVERRIDE_BOXES,
  UNITS,
  terrainRect,
} from "./atlas/tables";

/**
 * Builds `app/lib/render/atlas.generated.ts` — the single source of sprite
 * geometry for the battlefield (`pnpm atlas`).
 *
 * The art is a set of Advance-Wars rips with no uniform grid, so instead of
 * spreading pixel offsets through the render code we resolve them once here:
 * declared rectangles for terrain / buildings / HUD / effects, and alpha-scanned
 * bounding boxes for the unit clips (see `atlas/detect.ts`). Swapping the pack
 * later means re-running this, not editing the renderer.
 *
 * @see docs/decisions/0005-advance-wars-asset-pack.md
 */

const ASSETS = join(process.cwd(), "public/game-assets");
const OUTPUT = join(process.cwd(), "app/lib/render/atlas.generated.ts");
/** Units are drawn from whichever faction sheet owns them at render time. */
const FACTION_SLOT = "{faction}";

interface Entry extends Box {
  readonly file: string;
}

const atlas = new Map<string, Entry>();

function put(key: string, file: string, box: Box): void {
  if (atlas.has(key)) throw new Error(`duplicate atlas key: ${key}`);
  atlas.set(key, { file, x: box.x, y: box.y, w: box.w, h: box.h });
}

// --- Terrain, buildings, HUD, effects: declared rectangles ---------------------

for (const [name, [file, position]] of Object.entries(TERRAIN)) {
  put(`terrain_${name}`, `terrain/${file}`, terrainRect(position));
}
for (const [name, [file, box]] of Object.entries(TERRAIN_OVERRIDE_BOXES)) {
  put(`terrain_${name}`, `terrain/${file}`, box);
}

const BUILDING_FILE = "buildings/colored_buildings.png";
for (const [type, spec] of Object.entries(BUILDINGS)) {
  for (const [color, [x, y]] of Object.entries(spec.colors)) {
    for (const frame of [0, 1]) {
      put(`building_${type}_${color}_${frame}`, BUILDING_FILE, {
        x: x + frame * spec.stride,
        y,
        w: spec.w,
        h: spec.h,
      });
    }
  }
  if (spec.neutral !== undefined) {
    const [x, y] = spec.neutral;
    // Neutral art is a single frame; both frame keys point at it so the scene
    // can animate every ownership state through the same lookup.
    for (const frame of [0, 1]) {
      put(`building_${type}_neutral_${frame}`, BUILDING_FILE, {
        x,
        y,
        w: spec.w,
        h: spec.h,
      });
    }
  }
}
put("building_silo_spent", BUILDING_FILE, SILO_SPENT);

for (const [name, box] of Object.entries(HUD))
  put(`hud_${name}`, "ui/things.png", box);
for (const [name, box] of Object.entries(PATH))
  put(`path_${name}`, "ui/things.png", box);

EXPLOSION_TOPS.forEach((top, index) => {
  const next = EXPLOSION_TOPS[index + 1] ?? top + 33;
  put(`fx_explosion_${index}`, "fx/death.png", {
    x: 35,
    y: top,
    w: 33,
    h: next - top,
  });
});
SPLASH_TOPS.forEach((top, index) => {
  const next = SPLASH_TOPS[index + 1] ?? top + 32;
  put(`fx_splash_${index}`, "fx/death.png", {
    x: 0,
    y: top,
    w: 34,
    h: next - top,
  });
});

// --- Units: seeds resolved against detected sprite boxes -----------------------

/** Detected boxes per unit sheet, cached — every faction shares the geometry. */
const sheetBoxes = new Map<string, Box[]>();
function boxesOf(sheet: string): Box[] {
  const cached = sheetBoxes.get(sheet);
  if (cached !== undefined) return cached;
  // Blue is the reference sheet; the four palettes are pixel-identical in layout.
  const detected = detectSprites(
    readSheet(join(ASSETS, `units/blue/${sheet}.png`)),
    1,
  ).filter((b) => b.w >= 8 && b.h >= 8 && b.w <= 26 && b.h <= 26);
  sheetBoxes.set(sheet, detected);
  return detected;
}

/**
 * The `count` frames of a clip: the box under `seed`, then its neighbors to the
 * right within the same band. Skipping `offset` boxes lets a second clip start
 * where the previous one ended (the walk cycle follows the idle frames).
 */
function clipFrames(
  sheet: string,
  seed: readonly [number, number],
  offset: number,
  count: number,
): Box[] {
  const boxes = boxesOf(sheet);
  const [x, y] = seed;
  const first = boxAt(boxes, x, y);
  if (first === null) {
    throw new Error(`no sprite detected at ${sheet} ${x},${y}`);
  }
  const band = bands(boxes).find((row) => row.includes(first));
  if (band === undefined) throw new Error(`no band for ${sheet} ${x},${y}`);
  const start = band.indexOf(first) + offset;
  const frames = band.slice(start, start + count);
  if (frames.length < count) {
    throw new Error(
      `${sheet} ${x},${y}: wanted ${count} frames from index ${start}, found ${frames.length}`,
    );
  }
  return frames;
}

function putUnitClip(
  unit: string,
  sheet: UnitFile,
  animation: string,
  frames: readonly Box[],
): void {
  frames.forEach((box, index) => {
    put(
      `unit_${unit}_${animation}_${index}`,
      `units/${FACTION_SLOT}/${sheet}.png`,
      box,
    );
  });
}

type UnitFile = "sprites" | "air" | "sea";

for (const [unit, spec] of Object.entries(UNITS)) {
  const sheet = spec.sheet;
  const idle = spec.idle;
  putUnitClip(
    unit,
    sheet,
    "idle",
    "rects" in idle ? idle.rects : clipFrames(sheet, idle.seed, 0, idle.frames),
  );
  if (spec.moveSide !== undefined && "seed" in idle) {
    putUnitClip(
      unit,
      sheet,
      "move_side",
      clipFrames(sheet, idle.seed, idle.frames, spec.moveSide.frames),
    );
  }
  if (spec.moveUp !== undefined) {
    putUnitClip(
      unit,
      sheet,
      "move_up",
      clipFrames(sheet, spec.moveUp.seed, 0, spec.moveUp.frames),
    );
    if (spec.moveDown !== undefined) {
      putUnitClip(
        unit,
        sheet,
        "move_down",
        clipFrames(
          sheet,
          spec.moveUp.seed,
          spec.moveUp.frames,
          spec.moveDown.frames,
        ),
      );
    }
  }
}

// The submerged submarine shares the surfaced frames (rendered translucent).
for (const [alias, source] of Object.entries(SUBMERGED_ALIAS)) {
  for (const [key, entry] of [...atlas]) {
    const prefix = `unit_${source}_`;
    if (key.startsWith(prefix)) {
      put(`unit_${alias}_${key.slice(prefix.length)}`, entry.file, entry);
    }
  }
}

// --- Emit ----------------------------------------------------------------------

const keys = [...atlas.keys()].sort();
const body = keys
  .map((key) => {
    const e = atlas.get(key)!;
    return `  ${key}: { file: "${e.file}", x: ${e.x}, y: ${e.y}, w: ${e.w}, h: ${e.h} },`;
  })
  .join("\n");

const source = `// Generated by \`pnpm atlas\` (scripts/build-atlas.ts). Do not edit by hand.
//
// Sprite geometry for every battlefield asset: terrain autotiles, property
// buildings in their ownership colors, unit animation frames, HUD icons, path
// arrows and effects. Unit entries carry a "{faction}" path slot the renderer
// fills in — the four faction sheets are laid out identically.

/** A rectangle in an asset file, relative to \`/game-assets\`. */
export interface AtlasEntry {
  readonly file: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const ATLAS = {
${body}
} as const satisfies Record<string, AtlasEntry>;

export type AtlasKey = keyof typeof ATLAS;
`;

writeFileSync(OUTPUT, source);
console.log(`atlas: ${keys.length} entries → ${OUTPUT}`);
