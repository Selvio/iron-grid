import { describe, expect, it } from "vitest";

import { loadGameData } from "../load";
import { GameDataError } from "../errors";
import { parseMaps } from "../schemas/maps";
import { validateIntegrity } from "./integrity";

/**
 * M1-T5: cross-file integrity. The real data set passes end-to-end (proven by
 * loadGameData); here we confirm each cross-file class of failure is caught by
 * tampering with a valid copy, and that per-map references are checked on a
 * fixture (the official set is still empty).
 *
 * @see docs/04-development/milestones/m1-game-data.md (M1-T5)
 */
const data = loadGameData();

describe("reference resolution across files", () => {
  it("accepts the real, fully-resolved data set", () => {
    expect(() => validateIntegrity(data)).not.toThrow();
  });

  it("rejects a unit whose weapon no longer resolves", () => {
    const weapons: Record<string, (typeof data.weapons)[string]> = {
      ...data.weapons,
    };
    delete weapons.machine_gun; // infantry's only weapon
    expect(() => validateIntegrity({ ...data, weapons })).toThrow(
      GameDataError,
    );
  });

  it("rejects a producer whose unit list drifts from its category", () => {
    const base = data.properties.base!;
    const properties = {
      ...data.properties,
      base: {
        ...base,
        production: { ...base.production, allowed_unit_ids: ["infantry"] },
      },
    };
    expect(() => validateIntegrity({ ...data, properties })).toThrow(
      GameDataError,
    );
  });
});

/** A 16x20 Plain grid, with `(x, y) -> terrainId` overrides applied. */
function terrainGrid(overrides: [number, number, string][] = []): string[][] {
  const grid = Array.from({ length: 16 }, () =>
    Array.from({ length: 20 }, () => "plain"),
  );
  for (const [x, y, id] of overrides) grid[y]![x] = id;
  return grid;
}

/** Wrap one map instance in the maps-file shape and parse it to a typed GameMap. */
function typedMap(map: Record<string, unknown>) {
  return parseMaps({
    official_maps: { [map.id as string]: map },
    publication_state: { official_map_count: 1 },
  });
}

/** A cross-file-valid fixture map: HQ tiles under HQ properties, units on Plain. */
function fixtureMap(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "test_map",
    version: "0.1.0",
    status: "draft",
    dimensions: { width: 20, height: 16 },
    player_slots: {
      player_1: { id: "player_1", headquarters_property_id: "hq1" },
      player_2: { id: "player_2", headquarters_property_id: "hq2" },
    },
    logical_terrain: terrainGrid([
      [0, 0, "headquarters"],
      [19, 15, "headquarters"],
    ]),
    properties: [
      {
        id: "hq1",
        type_id: "headquarters",
        x: 0,
        y: 0,
        initial_owner: "player_1",
      },
      {
        id: "hq2",
        type_id: "headquarters",
        x: 19,
        y: 15,
        initial_owner: "player_2",
      },
    ],
    starting_units: [
      { id: "u1", type_id: "infantry", owner: "player_1", x: 1, y: 0 },
      { id: "u2", type_id: "infantry", owner: "player_2", x: 18, y: 15 },
    ],
    starting_funds: { player_1: 0, player_2: 0 },
    balance: { status: "not_started" },
    ...overrides,
  };
}

// A fully cross-file-valid official map is not constructible yet: every property
// terrain (headquarters/city/base/...) is still art-gated to official_map_allowed
// = false, which is exactly why official_maps is empty and blocked. We therefore
// exercise the per-map reference checks through the failures they must catch.
describe("per-map references (fixture)", () => {
  it("rejects a property sitting on the wrong terrain", () => {
    // All-Plain grid: the HQ properties no longer sit on 'headquarters' tiles.
    const map = fixtureMap({ logical_terrain: terrainGrid() });
    expect(() => validateIntegrity({ ...data, maps: typedMap(map) })).toThrow(
      GameDataError,
    );
  });

  it("rejects blocked terrain and a start it cannot occupy", () => {
    // 'reef' is impassable to foot and not allowed on official maps.
    const map = fixtureMap({
      logical_terrain: terrainGrid([[1, 0, "reef"]]),
    });
    expect(() => validateIntegrity({ ...data, maps: typedMap(map) })).toThrow(
      GameDataError,
    );
  });
});
