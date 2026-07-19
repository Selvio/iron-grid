import type { Box } from "./detect";

/**
 * The curated half of the atlas build: what each sheet contains and where.
 *
 * Terrain, buildings, HUD icons and effects are declared as exact rectangles —
 * they are ported from the source project's renderers
 * (`fr/main/view/render/{terrains,buildings}/…`, `TerrainLocation.java`), which
 * already measured them. Units are declared as *seeds* instead: a coordinate
 * inside the first frame of a clip plus how many frames follow it, because the
 * unit sheets are rips with no grid and hand-measuring ~150 boxes is exactly
 * what the detector in `detect.ts` exists to avoid.
 *
 * @see docs/decisions/0005-advance-wars-asset-pack.md
 */

// --- Terrain -------------------------------------------------------------------

/**
 * The nine autotile positions of a terrain file, plus the four 8×8 inner
 * corners. Tiles are 16 px with a 1 px gutter, hence the 0 / 17 / 34 offsets
 * (`TerrainLocation.TerrainImageRect`).
 */
const T = {
  top_left: { x: 0, y: 0, w: 16, h: 16 },
  top: { x: 17, y: 0, w: 16, h: 16 },
  top_right: { x: 34, y: 0, w: 16, h: 16 },
  left: { x: 0, y: 17, w: 16, h: 16 },
  center: { x: 17, y: 17, w: 16, h: 16 },
  right: { x: 34, y: 17, w: 16, h: 16 },
  bottom_left: { x: 0, y: 34, w: 16, h: 16 },
  bottom: { x: 17, y: 34, w: 16, h: 16 },
  bottom_right: { x: 34, y: 34, w: 16, h: 16 },
  corner_top_left: { x: 17, y: 17, w: 8, h: 8 },
  corner_top_right: { x: 25, y: 17, w: 8, h: 8 },
  corner_bottom_left: { x: 17, y: 25, w: 8, h: 8 },
  corner_bottom_right: { x: 25, y: 25, w: 8, h: 8 },
} as const satisfies Record<string, Box>;

type Position = keyof typeof T;

/** `terrain_<name>` → the file and position it is cut from. */
export const TERRAIN: Readonly<Record<string, readonly [string, Position]>> = {
  // Plain ground and its drop shadow strip.
  plain: ["rivers1.png", "center"],
  plain_shadow: ["lowland_shadow.png", "top_left"],
  hill: ["hill.png", "top_left"],
  forest: ["forest.png", "top_left"],
  mountain: ["mountain.png", "top_left"],
  reef: ["cliffs.png", "center"],

  // Open water plus the cliff edges that frame it (`SeaLocation`).
  sea: ["beach1.png", "center"],
  sea_left: ["cliffs.png", "left"],
  sea_right: ["cliffs.png", "right"],
  sea_top: ["cliffs.png", "top"],
  sea_bottom: ["cliffs.png", "bottom"],
  sea_top_left: ["cliffs.png", "top_left"],
  sea_top_right: ["cliffs.png", "top_right"],
  sea_bottom_left: ["cliffs.png", "bottom_left"],
  sea_bottom_right: ["cliffs.png", "bottom_right"],
  sea_corner_top_left: ["cliffs2.png", "corner_top_left"],
  sea_corner_top_right: ["cliffs2.png", "corner_top_right"],
  sea_corner_bottom_left: ["cliffs2.png", "corner_bottom_left"],
  sea_corner_bottom_right: ["cliffs2.png", "corner_bottom_right"],

  // Sand transitions (`BeachLocation`): the edge sets face the sea.
  beach_left: ["beach2.png", "left"],
  beach_right: ["beach2.png", "right"],
  beach_top: ["beach2.png", "top"],
  beach_bottom: ["beach2.png", "bottom"],
  beach_filled_left: ["beach1.png", "right"],
  beach_filled_right: ["beach1.png", "left"],
  beach_filled_top: ["beach1.png", "bottom"],
  beach_filled_bottom: ["beach1.png", "top"],
  beach_inner_bottom_right: ["beach2.png", "bottom_right"],
  beach_inner_bottom_left: ["beach2.png", "bottom_left"],
  beach_inner_top_right: ["beach2.png", "top_right"],
  beach_inner_top_left: ["beach2.png", "top_left"],
  beach_outer_bottom_right: ["beach1.png", "bottom_right"],
  beach_outer_bottom_left: ["beach1.png", "bottom_left"],
  beach_outer_top_right: ["beach1.png", "top_right"],
  beach_outer_top_left: ["beach1.png", "top_left"],

  // River channel (`RiverLocation`).
  river_horizontal: ["rivers1.png", "top"],
  river_vertical: ["rivers1.png", "left"],
  river_center: ["rivers2.png", "center"],
  river_left_end: ["rivers2.png", "top_left"],
  river_right_end: ["rivers2.png", "top_right"],
  river_top_end: ["rivers2.png", "bottom_left"],
  river_bottom_end: ["rivers2.png", "bottom_right"],
  river_t_top: ["rivers2.png", "bottom"],
  river_t_right: ["rivers2.png", "left"],
  river_t_left: ["rivers2.png", "right"],
  river_t_bottom: ["rivers2.png", "top"],
  river_turn_top_right: ["rivers1.png", "bottom_left"],
  river_turn_top_left: ["rivers1.png", "bottom_right"],
  river_turn_bottom_right: ["rivers1.png", "top_left"],
  river_turn_bottom_left: ["rivers1.png", "top_right"],

  // Asphalt (`RoadLocation`).
  road_horizontal: ["roads1.png", "left"],
  road_vertical: ["roads1.png", "bottom_left"],
  road_center: ["roads2.png", "center"],
  road_t_top: ["roads2.png", "bottom"],
  road_t_right: ["roads2.png", "left"],
  road_t_left: ["roads2.png", "right"],
  road_t_bottom: ["roads2.png", "top"],
  road_turn_top_right: ["roads2.png", "bottom_left"],
  road_turn_top_left: ["roads2.png", "bottom_right"],
  road_turn_bottom_right: ["roads2.png", "top_left"],
  road_turn_bottom_left: ["roads2.png", "top_right"],

  bridge_horizontal: ["bridge.png", "top_left"],
  bridge_vertical: ["bridge.png", "left"],
};

export const terrainRect = (position: Position): Box => T[position];

// --- Buildings -----------------------------------------------------------------

/**
 * `colored_buildings.png` holds every property in five ownership palettes, two
 * animation frames each. Neutral (white) sits in its own column at the right;
 * the headquarters has no neutral variant because an HQ is always owned.
 * Rectangles ported from `view/render/buildings/*Renderer.java`.
 */
export interface BuildingSpec {
  readonly w: number;
  readonly h: number;
  /** Top-left of frame 0 per color; frame 1 follows at `+stride` px. */
  readonly colors: Readonly<Record<string, readonly [number, number]>>;
  readonly stride: number;
  /** Neutral art is a single frame. */
  readonly neutral?: readonly [number, number];
}

export const BUILDINGS: Readonly<Record<string, BuildingSpec>> = {
  city: {
    w: 16,
    h: 20,
    stride: 20,
    colors: {
      red: [0, 137],
      blue: [43, 137],
      green: [86, 137],
      yellow: [127, 137],
    },
    neutral: [168, 137],
  },
  base: {
    w: 16,
    h: 16,
    stride: 19,
    colors: {
      red: [0, 161],
      blue: [43, 161],
      green: [86, 161],
      yellow: [127, 161],
    },
    neutral: [168, 160],
  },
  airport: {
    w: 16,
    h: 18,
    stride: 19,
    colors: {
      red: [0, 181],
      blue: [43, 181],
      green: [86, 181],
      yellow: [127, 181],
    },
    neutral: [168, 180],
  },
  port: {
    w: 16,
    h: 21,
    stride: 19,
    colors: {
      red: [0, 202],
      blue: [43, 202],
      green: [86, 202],
      yellow: [127, 202],
    },
    neutral: [169, 201],
  },
  headquarters: {
    w: 16,
    h: 31,
    stride: 19,
    colors: {
      red: [0, 0],
      blue: [43, 36],
      green: [86, 71],
      yellow: [127, 102],
    },
  },
  silo: {
    w: 16,
    h: 23,
    stride: 0,
    colors: {},
    neutral: [168, 225],
  },
};

/** The spent missile silo — a separate, shorter sprite. */
export const SILO_SPENT: Box = { x: 187, y: 234, w: 16, h: 15 };

// --- Units ---------------------------------------------------------------------

/**
 * A unit's clips as seeds into a detected sprite band.
 *
 * `seed` is any pixel inside the clip's first frame; the build snaps it to the
 * detected box, then takes the following boxes of that band left-to-right. The
 * ground sheets lay every unit out as a side row (idle, then the walk cycle)
 * over a vertical row (walking away from, then toward the camera); the air and
 * naval sheets only give a usable side row, so those units reuse idle for walks.
 */
export interface UnitSpec {
  /** Which per-faction sheet the unit lives on. */
  readonly sheet: "sprites" | "air" | "sea";
  /**
   * Either a seed into the detected band, or explicit rectangles. The air and
   * naval sheets pack their sprites tight enough that neighbouring units bleed
   * into one detected blob, so those are declared outright — the rectangles come
   * from the source project's renderers, which measured them by hand.
   */
  readonly idle:
    | { readonly seed: readonly [number, number]; readonly frames: number }
    | { readonly rects: readonly Box[] };
  readonly moveSide?: { readonly frames: number };
  readonly moveUp?: {
    readonly seed: readonly [number, number];
    readonly frames: number;
  };
  readonly moveDown?: { readonly frames: number };
}

/** Frames laid out at a fixed stride — the air/naval sheets' usual spacing. */
function strip(
  x: number,
  y: number,
  w: number,
  h: number,
  count: number,
  stride: number,
): Box[] {
  return Array.from({ length: count }, (_, i) => ({
    x: x + i * stride,
    y,
    w,
    h,
  }));
}

/**
 * Seeds verified against the source project's renderers
 * (`view/render/units/**`) and the detector's band report.
 *
 * `neotank` has no map sprite in this pack — the sheet stops at the medium tank —
 * so it borrows the medium tank's art. Tracked as a known gap in
 * `assets-inventory.md`; swap it the moment real art exists.
 */
export const UNITS: Readonly<Record<string, UnitSpec>> = {
  infantry: {
    sheet: "sprites",
    idle: { seed: [9, 95], frames: 3 },
    moveSide: { frames: 4 },
    moveUp: { seed: [8, 124], frames: 4 },
    moveDown: { frames: 4 },
  },
  mech: {
    sheet: "sprites",
    idle: { seed: [332, 55], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [334, 80], frames: 4 },
    moveDown: { frames: 4 },
  },
  recon: {
    sheet: "sprites",
    idle: { seed: [19, 253], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [25, 274], frames: 3 },
    moveDown: { frames: 3 },
  },
  apc: {
    sheet: "sprites",
    idle: { seed: [22, 545], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [20, 572], frames: 3 },
    moveDown: { frames: 3 },
  },
  artillery: {
    sheet: "sprites",
    idle: { seed: [23, 719], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [23, 750], frames: 3 },
    moveDown: { frames: 3 },
  },
  tank: {
    sheet: "sprites",
    idle: { seed: [452, 287], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [451, 311], frames: 3 },
    moveDown: { frames: 3 },
  },
  anti_air: {
    sheet: "sprites",
    idle: { seed: [22, 953], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [24, 986], frames: 3 },
    moveDown: { frames: 3 },
  },
  missiles: {
    sheet: "sprites",
    idle: { seed: [437, 894], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [437, 925], frames: 3 },
    moveDown: { frames: 3 },
  },
  rockets: {
    sheet: "sprites",
    idle: { seed: [442, 755], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [443, 787], frames: 3 },
    moveDown: { frames: 3 },
  },
  medium_tank: {
    sheet: "sprites",
    idle: { seed: [455, 1044], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [455, 1066], frames: 3 },
    moveDown: { frames: 3 },
  },
  neotank: {
    sheet: "sprites",
    idle: { seed: [455, 1044], frames: 4 },
    moveSide: { frames: 3 },
    moveUp: { seed: [455, 1066], frames: 3 },
    moveDown: { frames: 3 },
  },

  fighter: { sheet: "air", idle: { rects: strip(90, 6, 15, 16, 2, 21) } },
  bomber: { sheet: "air", idle: { rects: strip(94, 100, 16, 16, 2, 23) } },
  battle_copter: { sheet: "air", idle: { rects: strip(18, 1, 16, 17, 3, 20) } },
  transport_copter: {
    sheet: "air",
    idle: { rects: strip(21, 98, 15, 14, 3, 19) },
  },

  lander: { sheet: "sea", idle: { rects: strip(9, 3, 16, 16, 2, 18) } },
  cruiser: { sheet: "sea", idle: { rects: strip(174, 7, 13, 12, 2, 19) } },
  battleship: { sheet: "sea", idle: { rects: strip(119, 4, 16, 15, 2, 20) } },
  submarine: { sheet: "sea", idle: { rects: strip(53, 7, 16, 11, 3, 21) } },
};

/** The submerged submarine reuses the surfaced art; the scene fades it (§19.5). */
export const SUBMERGED_ALIAS = { submarine_submerged: "submarine" } as const;

// --- HUD icons and effects -----------------------------------------------------

/** `things.png` crops, ported from `TerrainPanel` / `StatView` / `UnitRenderer`. */
export const HUD: Readonly<Record<string, Box>> = {
  life: { x: 1, y: 44, w: 7, h: 6 },
  fuel: { x: 1, y: 53, w: 7, h: 8 },
  ammo: { x: 1, y: 64, w: 7, h: 5 },
  lock: { x: 0, y: 69, w: 8, h: 8 },
  star: { x: 1, y: 92, w: 8, h: 8 },
  building: { x: 1, y: 29, w: 11, h: 12 },
  vision: { x: 75, y: 16, w: 30, h: 14 },
  fuel_label: { x: 62, y: 0, w: 11, h: 13 },
  life_label: { x: 75, y: 1, w: 11, h: 9 },
  mobility_foot: { x: 10, y: 48, w: 32, h: 15 },
  mobility_mech: { x: 44, y: 55, w: 32, h: 15 },
  mobility_tires: { x: 10, y: 64, w: 31, h: 15 },
  mobility_treads: { x: 49, y: 71, w: 31, h: 15 },
  mobility_ship: { x: 10, y: 80, w: 31, h: 15 },
  mobility_transport: { x: 49, y: 89, w: 32, h: 15 },
};

/** Movement-path arrows from `things.png` (`PathRenderer`). */
export const PATH: Readonly<Record<string, Box>> = {
  arrow_bottom: { x: 12, y: 32, w: 16, h: 16 },
  arrow_left: { x: 88, y: 94, w: 16, h: 16 },
  arrow_top: { x: 85, y: 76, w: 16, h: 16 },
  left_bottom: { x: 45, y: 15, w: 16, h: 16 },
  left_top: { x: 28, y: 32, w: 16, h: 16 },
  left_right: { x: 62, y: 33, w: 16, h: 16 },
  right_bottom: { x: 28, y: 15, w: 16, h: 16 },
  right_top: { x: 45, y: 32, w: 16, h: 16 },
  top_bottom: { x: 12, y: 15, w: 16, h: 16 },
};

/**
 * `death.png` is two stacked columns: an explosion for ground/air kills (right)
 * and a water plume for naval ones (left). Frame tops are irregular because the
 * artwork grows, so they are listed rather than strided.
 */
export const EXPLOSION_TOPS = [9, 34, 64, 96, 127, 161, 195, 227, 261, 295];
export const SPLASH_TOPS = [80, 100, 127, 161, 195, 229, 251];
