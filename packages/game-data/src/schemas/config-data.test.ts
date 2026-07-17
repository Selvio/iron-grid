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

describe("maps: the first official map (M10)", () => {
  const map = data.maps["crossfire-basin"];

  it("loads crossfire-basin, pending its balance sign-off", () => {
    expect(map).toBeDefined();
    // Not published — the two-human balance review is the owner's to record.
    expect(map!.status).toBe("review");
  });

  it("is 180°-rotationally symmetric — terrain, properties and starting units", () => {
    const m = map!;
    const W = m.dimensions.width;
    const H = m.dimensions.height;
    // Terrain mirrors under (x,y) -> (W-1-x, H-1-y).
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        expect(m.logical_terrain[y]![x]).toBe(
          m.logical_terrain[H - 1 - y]![W - 1 - x],
        );
      }
    }
    // Every property has a mirror of the same type; owned ones mirror to the
    // opposite player, neutral to neutral.
    const propAt = (x: number, y: number) =>
      m.properties.find((p) => p.x === x && p.y === y);
    const otherOwner: Record<string, string> = {
      player_1: "player_2",
      player_2: "player_1",
      neutral: "neutral",
    };
    for (const p of m.properties) {
      const mirror = propAt(W - 1 - p.x, H - 1 - p.y);
      expect(mirror, `mirror of ${p.id}`).toBeDefined();
      expect(mirror!.type_id).toBe(p.type_id);
      expect(mirror!.initial_owner).toBe(otherOwner[p.initial_owner]);
    }
    // Every starting unit has a mirror of the same type owned by the other player.
    const unitAt = (x: number, y: number) =>
      m.starting_units.find((u) => u.x === x && u.y === y);
    for (const u of m.starting_units) {
      const mirror = unitAt(W - 1 - u.x, H - 1 - u.y);
      expect(mirror, `mirror of ${u.id}`).toBeDefined();
      expect(mirror!.type_id).toBe(u.type_id);
      expect(mirror!.owner).toBe(otherOwner[u.owner]);
    }
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
