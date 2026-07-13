/**
 * `terrain.yaml` schema and intra-file validation.
 *
 * Validates terrain shape and the intra-file obligations from the file's
 * `required_validation_tests:`: unique IDs, movement-cost keys restricted to the
 * supported movement types, the official-map art gate, full impassability of
 * pipes, and Broken Pipe Seam mirroring Plain. Specific per-terrain cost /
 * defense / vision reference values are asserted as regression tests (M1-T6),
 * not baked into the loader, so a future rebalance is not a build failure.
 *
 * @see docs/02-data/terrain.yaml
 * @see docs/04-development/milestones/m1-game-data.md (M1-T3)
 */

import { z } from "zod";

import { assetStatus, fogConcealment, terrainGroup } from "./enums";
import { IssueCollector, parseShape } from "./parse";

/** Movement cost per movement type; `null` means impassable. Keys are exactly the supported types. */
const movementCosts = z.strictObject({
  foot: z.int().nullable(),
  mech: z.int().nullable(),
  tires: z.int().nullable(),
  treads: z.int().nullable(),
  air: z.int().nullable(),
  ship: z.int().nullable(),
  transport_ship: z.int().nullable(),
});

/** One terrain type (`terrain.yaml` terrains.*). */
const terrainSchema = z.looseObject({
  id: z.string(),
  display_name: z.string(),
  group: terrainGroup,
  defense_stars: z.int().min(0),
  movement_costs: movementCosts,
  fog: z.looseObject({
    concealment: fogConcealment,
    adjacency_reveals: z.boolean(),
    vision_bonus: z.looseObject({
      eligible_unit_types: z.array(z.string()),
      amount: z.int(),
    }),
  }),
  gameplay: z.looseObject({
    property_id: z.string().nullable(),
    capturable: z.boolean(),
    destructible: z.boolean(),
  }),
  rendering: z.looseObject({ asset_status: assetStatus }),
  official_map_allowed: z.boolean(),
});

/** The top-level `terrain.yaml` document. */
const terrainFile = z.looseObject({
  conventions: z.looseObject({
    rendering: z.looseObject({
      logical_terrain_separate_from_render_tile: z.boolean(),
    }),
  }),
  terrains: z.record(z.string(), terrainSchema),
});

/** A validated terrain type. */
export type Terrain = z.infer<typeof terrainSchema>;

/** The validated terrains, keyed by terrain ID. */
export type Terrains = Readonly<Record<string, Terrain>>;

/** Whether every movement cost is impassable (`null`) for a terrain. */
function fullyImpassable(t: Terrain): boolean {
  return Object.values(t.movement_costs).every((cost) => cost === null);
}

/** Whether two terrains share identical movement costs. */
function sameMovementCosts(a: Terrain, b: Terrain): boolean {
  const keys = Object.keys(
    a.movement_costs,
  ) as (keyof Terrain["movement_costs"])[];
  return keys.every((k) => a.movement_costs[k] === b.movement_costs[k]);
}

/**
 * Validate `terrain.yaml` and return its terrains keyed by ID.
 *
 * @throws {GameDataError} on any shape or intra-file semantic failure
 */
export function parseTerrain(raw: unknown): Terrains {
  const file = parseShape("terrain.yaml", terrainFile, raw);
  const c = new IssueCollector("terrain.yaml");
  const terrains = file.terrains;

  c.check(
    file.conventions.rendering.logical_terrain_separate_from_render_tile,
    "conventions.rendering.logical_terrain_separate_from_render_tile",
    "logical terrain and render tiles must be stored independently",
  );

  for (const [key, t] of Object.entries(terrains)) {
    const at = (sub: string): string => `terrains.${key}.${sub}`;
    c.check(
      t.id === key,
      at("id"),
      `id "${t.id}" does not match its key "${key}"`,
    );

    // Official-map art gate: only confirmed art may appear on production maps.
    c.check(
      t.official_map_allowed === (t.rendering.asset_status === "confirmed"),
      at("official_map_allowed"),
      `official_map_allowed must equal (asset_status === "confirmed"); asset_status is "${t.rendering.asset_status}"`,
    );
  }

  // Pipes and intact Pipe Seam are impassable to every movement type, including Air.
  for (const id of ["pipe", "pipe_seam"]) {
    const t = terrains[id];
    if (t === undefined) {
      c.check(false, `terrains.${id}`, `expected terrain "${id}" to exist`);
    } else {
      c.check(
        fullyImpassable(t),
        `terrains.${id}.movement_costs`,
        `"${id}" must be impassable to every movement type`,
      );
    }
  }

  // Broken Pipe Seam uses Plain's gameplay values.
  const plain = terrains.plain;
  const broken = terrains.broken_pipe_seam;
  if (plain !== undefined && broken !== undefined) {
    c.check(
      sameMovementCosts(broken, plain),
      "terrains.broken_pipe_seam.movement_costs",
      "Broken Pipe Seam must share Plain's movement costs",
    );
    c.check(
      broken.defense_stars === plain.defense_stars,
      "terrains.broken_pipe_seam.defense_stars",
      "Broken Pipe Seam must share Plain's defense stars",
    );
  }

  c.throwIfAny();
  return terrains;
}
