import type { GameData } from "game-data";

/**
 * Shared non-official test content for the lifecycle suites (M6).
 *
 * A throwaway `GameData` with one small map and a placeholder commander roster —
 * enough to create, join, select commanders, activate and cancel a match without
 * approved game content. NOT `maps.yaml` / `commanders.yaml` data: real official
 * maps and the commander roster are design-gated (`m6-lifecycle.md` §6).
 */

/** The id of the fixture map (what a create body passes as `mapId`). */
export const TEST_MAP_ID = "test-map";

/** Placeholder commander → faction bindings (one commander per faction). */
export const PLACEHOLDER_COMMANDERS: Readonly<Record<string, string>> = {
  "cmdr-blue": "blue",
  "cmdr-green": "green",
  "cmdr-red": "red",
  "cmdr-yellow": "yellow",
};

/** A minimal `GameData` covering the fields the lifecycle + builder read. */
export function fixtureGameData(): GameData {
  return {
    version: "1.0.0",
    units: {
      infantry: {
        category: "ground",
        max_true_hp: 100,
        movement: { type: "foot", points: 3 },
        logistics: { max_fuel: 99, daily_fuel: { default: 0 }, max_ammo: null },
        special_states: [],
      },
      tank: {
        category: "ground",
        max_true_hp: 100,
        movement: { type: "treads", points: 6 },
        logistics: { max_fuel: 70, daily_fuel: { default: 0 }, max_ammo: 9 },
        special_states: [],
      },
    },
    properties: {
      headquarters: { economy: { income_per_turn: 1000 } },
      city: { economy: { income_per_turn: 1000 } },
    },
    commanders: {
      factions: {
        blue: { id: "blue", commander_id: "cmdr-blue" },
        green: { id: "green", commander_id: "cmdr-green" },
        red: { id: "red", commander_id: "cmdr-red" },
        yellow: { id: "yellow", commander_id: "cmdr-yellow" },
      },
      commanders: {
        "cmdr-blue": { id: "cmdr-blue", faction_id: "blue", status: "blocked" },
        "cmdr-green": {
          id: "cmdr-green",
          faction_id: "green",
          status: "blocked",
        },
        "cmdr-red": { id: "cmdr-red", faction_id: "red", status: "blocked" },
        "cmdr-yellow": {
          id: "cmdr-yellow",
          faction_id: "yellow",
          status: "blocked",
        },
      },
    },
    maps: {
      [TEST_MAP_ID]: {
        id: TEST_MAP_ID,
        version: "1.0.0",
        status: "draft",
        dimensions: { width: 5, height: 4 },
        player_slots: {
          player_1: { id: "player_1", headquarters_property_id: "hq1" },
          player_2: { id: "player_2", headquarters_property_id: "hq2" },
        },
        logical_terrain: [
          ["plain", "plain", "plain", "plain", "plain"],
          ["plain", "plain", "plain", "plain", "plain"],
          ["plain", "plain", "plain", "plain", "plain"],
          ["plain", "plain", "plain", "plain", "plain"],
        ],
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
            x: 4,
            y: 3,
            initial_owner: "player_2",
          },
          {
            id: "city1",
            type_id: "city",
            x: 2,
            y: 2,
            initial_owner: "neutral",
          },
        ],
        starting_units: [
          { id: "u1", type_id: "infantry", owner: "player_1", x: 0, y: 1 },
          { id: "u2", type_id: "tank", owner: "player_2", x: 4, y: 2 },
        ],
        starting_funds: { player_1: 1500, player_2: 1500 },
        balance: { status: "draft" },
      },
    },
  } as unknown as GameData;
}
