/**
 * `maps.yaml` schema and intra-file validation.
 *
 * Validates the map-instance contract and self-contained per-map integrity
 * checks (dimensions vs terrain grid, two player slots, one non-neutral
 * Headquarters per player, unique IDs/coordinates, in-bounds placements,
 * non-negative funds). Cross-file checks are deferred to integrity.ts.
 *
 * @see docs/02-data/maps.yaml
 * @see docs/04-development/milestones/m1-game-data.md (M1-T4)
 */

import { z } from "zod";

import { initialOwner, mapStatus, playerSlotId } from "./enums";
import { IssueCollector, parseShape } from "./parse";

/** A property placed on a map (`maps.yaml` property_instance_schema). */
const propertyInstance = z.looseObject({
  id: z.string(),
  type_id: z.string(),
  x: z.int(),
  y: z.int(),
  initial_owner: initialOwner,
});

/** A unit placed on a map (`maps.yaml` starting_unit_schema). */
const startingUnit = z.looseObject({
  id: z.string(),
  type_id: z.string(),
  owner: playerSlotId,
  x: z.int(),
  y: z.int(),
});

/** One player's slot on a map (`maps.yaml` player_slot_schema). */
const playerSlot = z.looseObject({
  id: playerSlotId,
  headquarters_property_id: z.string().nullable(),
});

/** A full map instance (`maps.yaml` map_schema / map_template). */
const mapInstance = z.looseObject({
  id: z.string(),
  version: z.string(),
  status: mapStatus,
  dimensions: z.looseObject({
    width: z.int().positive(),
    height: z.int().positive(),
  }),
  player_slots: z.looseObject({ player_1: playerSlot, player_2: playerSlot }),
  logical_terrain: z.array(z.array(z.string())),
  properties: z.array(propertyInstance),
  starting_units: z.array(startingUnit),
  starting_funds: z.looseObject({ player_1: z.int(), player_2: z.int() }),
  balance: z.looseObject({ status: z.string() }),
});

/** A validated map instance. */
export type GameMap = z.infer<typeof mapInstance>;

/** The validated official maps, keyed by map ID (empty until M10). */
export type GameMaps = Readonly<Record<string, GameMap>>;

/** The top-level `maps.yaml` document. */
const mapsFile = z.looseObject({
  official_maps: z.record(z.string(), mapInstance),
  publication_state: z.looseObject({ official_map_count: z.int() }),
});

/** Report duplicate values in `items`, mapping each to a locating string for the message. */
function findDuplicates(items: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) dupes.add(item);
    seen.add(item);
  }
  return [...dupes];
}

/** Whether a coordinate lies inside the map's declared dimensions. */
function inBounds(
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

/** Run the self-contained integrity checks for one map, collecting any issues. */
function validateMap(c: IssueCollector, key: string, map: GameMap): void {
  const at = (sub: string): string => `official_maps.${key}.${sub}`;
  const width = map.dimensions.width;
  const height = map.dimensions.height;
  const expectedCells = width * height;

  // Dimensions and terrain-grid shape must agree with the map's own size.
  const rows = map.logical_terrain;
  c.check(
    rows.length === height,
    at("logical_terrain"),
    `must have ${height} rows, found ${rows.length}`,
  );
  const cellCount = rows.reduce((n, row) => n + row.length, 0);
  c.check(
    cellCount === expectedCells,
    at("logical_terrain"),
    `must have ${expectedCells} cells, found ${cellCount}`,
  );
  for (const [i, row] of rows.entries()) {
    c.check(
      row.length === width,
      at(`logical_terrain[${i}]`),
      `row must have ${width} cells, found ${row.length}`,
    );
  }

  // Unique property and unit identity / placement.
  const propIdDupes = findDuplicates(map.properties.map((p) => p.id));
  c.check(
    propIdDupes.length === 0,
    at("properties"),
    `duplicate property IDs: ${propIdDupes.join(", ")}`,
  );
  const propCoordDupes = findDuplicates(
    map.properties.map((p) => `${p.x},${p.y}`),
  );
  c.check(
    propCoordDupes.length === 0,
    at("properties"),
    `duplicate property coordinates: ${propCoordDupes.join(", ")}`,
  );
  const unitIdDupes = findDuplicates(map.starting_units.map((u) => u.id));
  c.check(
    unitIdDupes.length === 0,
    at("starting_units"),
    `duplicate unit IDs: ${unitIdDupes.join(", ")}`,
  );
  const unitCoordDupes = findDuplicates(
    map.starting_units.map((u) => `${u.x},${u.y}`),
  );
  c.check(
    unitCoordDupes.length === 0,
    at("starting_units"),
    `duplicate unit coordinates: ${unitCoordDupes.join(", ")}`,
  );

  for (const p of map.properties) {
    c.check(
      inBounds(p.x, p.y, width, height),
      at(`properties.${p.id}`),
      `coordinates (${p.x}, ${p.y}) are outside ${width}x${height}`,
    );
  }
  for (const u of map.starting_units) {
    c.check(
      inBounds(u.x, u.y, width, height),
      at(`starting_units.${u.id}`),
      `coordinates (${u.x}, ${u.y}) are outside ${width}x${height}`,
    );
  }

  // Exactly one non-neutral Headquarters per player.
  const hqs = map.properties.filter((p) => p.type_id === "headquarters");
  for (const hq of hqs) {
    c.check(
      hq.initial_owner !== "neutral",
      at(`properties.${hq.id}`),
      "a Headquarters may not be neutral",
    );
  }
  for (const slot of ["player_1", "player_2"] as const) {
    const owned = hqs.filter((hq) => hq.initial_owner === slot);
    c.check(
      owned.length === 1,
      at("properties"),
      `exactly one Headquarters must belong to ${slot}, found ${owned.length}`,
    );
    const declaredHqId = map.player_slots[slot].headquarters_property_id;
    c.check(
      declaredHqId !== null,
      at(`player_slots.${slot}.headquarters_property_id`),
      `${slot} must declare its Headquarters`,
    );
    if (declaredHqId !== null) {
      const declared = map.properties.find((p) => p.id === declaredHqId);
      c.check(
        declared !== undefined &&
          declared.type_id === "headquarters" &&
          declared.initial_owner === slot,
        at(`player_slots.${slot}.headquarters_property_id`),
        `"${declaredHqId}" must be ${slot}'s Headquarters property`,
      );
    }
  }

  // Non-negative starting funds.
  c.check(
    map.starting_funds.player_1 >= 0,
    at("starting_funds.player_1"),
    "starting funds must be non-negative",
  );
  c.check(
    map.starting_funds.player_2 >= 0,
    at("starting_funds.player_2"),
    "starting funds must be non-negative",
  );

  // A published map must carry an approved balance review.
  if (map.status === "published") {
    c.check(
      map.balance.status === "approved",
      at("balance.status"),
      "a published map requires an approved balance review",
    );
  }
}

/**
 * Validate `maps.yaml` and return its official maps (empty until M10).
 *
 * @throws {GameDataError} on any shape or intra-file semantic failure
 */
export function parseMaps(raw: unknown): GameMaps {
  const file = parseShape("maps.yaml", mapsFile, raw);
  const c = new IssueCollector("maps.yaml");
  const maps = file.official_maps;

  c.check(
    file.publication_state.official_map_count === Object.keys(maps).length,
    "publication_state.official_map_count",
    `disagrees with the ${Object.keys(maps).length} official maps present`,
  );

  for (const [key, map] of Object.entries(maps)) validateMap(c, key, map);

  c.throwIfAny();
  return maps;
}
