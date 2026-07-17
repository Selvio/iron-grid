import { describe, expect, it } from "vitest";

import { loadGameData } from "../load";
import { GameDataError } from "../errors";
import { parseCommanders } from "./commanders";
import { parseMaps } from "./maps";

/**
 * M1-T4: the commander and map contracts validate in their real design-blocked /
 * empty state, and the per-map integrity checks bite on a fixture map (there is
 * no official map to exercise them against yet).
 *
 * @see docs/02-data/commanders.yaml (design-blocked)
 * @see docs/02-data/maps.yaml (official_maps: {})
 * @see docs/04-development/milestones/m1-game-data.md (M1-T4)
 */
const data = loadGameData();

describe("commanders (design-blocked) contract", () => {
  const { factions, commanders } = data.commanders;

  it("has four factions and four commander slots, none enabled", () => {
    expect(Object.keys(factions)).toHaveLength(4);
    expect(Object.keys(commanders)).toHaveLength(4);
    for (const commander of Object.values(commanders)) {
      expect(commander.implementation.enabled_in_mvp).toBe(false);
      expect(commander.status).toBe("blocked");
    }
  });

  it("binds each faction to its commander one-to-one", () => {
    for (const faction of Object.values(factions)) {
      expect(commanders[faction.commander_id]?.faction_id).toBe(faction.id);
    }
  });
});

describe("maps: empty official set", () => {
  it("loads the first official map (M10)", () => {
    expect(Object.keys(data.maps)).toContain("crossfire-basin");
  });
});

/** A 16x20 grid of Plain (terrain resolution is a cross-file concern, M1-T5). */
function terrainGrid(): string[][] {
  return Array.from({ length: 16 }, () =>
    Array.from({ length: 20 }, () => "plain"),
  );
}

/** A minimal valid map instance, with optional field overrides. */
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
    logical_terrain: terrainGrid(),
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

/** Wrap a map (or nothing) in the minimal maps-file shape parseMaps expects. */
function mapsFile(map?: Record<string, unknown>): unknown {
  const official = map ? { [map.id as string]: map } : {};
  return {
    official_maps: official,
    publication_state: { official_map_count: Object.keys(official).length },
  };
}

describe("maps: per-map integrity checks (fixture)", () => {
  it("accepts a well-formed map", () => {
    expect(Object.keys(parseMaps(mapsFile(fixtureMap())))).toEqual([
      "test_map",
    ]);
  });

  it("rejects a neutral Headquarters", () => {
    const map = fixtureMap({
      properties: [
        {
          id: "hq1",
          type_id: "headquarters",
          x: 0,
          y: 0,
          initial_owner: "neutral",
        },
        {
          id: "hq2",
          type_id: "headquarters",
          x: 19,
          y: 15,
          initial_owner: "player_2",
        },
      ],
    });
    expect(() => parseMaps(mapsFile(map))).toThrow(GameDataError);
  });

  it("rejects wrong dimensions and a miscounted publication state", () => {
    expect(() =>
      parseMaps(
        mapsFile(fixtureMap({ dimensions: { width: 10, height: 16 } })),
      ),
    ).toThrow(GameDataError);
    expect(() =>
      parseMaps({
        official_maps: {},
        publication_state: { official_map_count: 1 },
      }),
    ).toThrow(GameDataError);
  });
});

describe("parsers reject malformed input", () => {
  it("throws GameDataError, not a raw ZodError", () => {
    expect(() => parseCommanders({})).toThrow(GameDataError);
    expect(() => parseMaps({})).toThrow(GameDataError);
  });
});
