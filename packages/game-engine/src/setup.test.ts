import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import {
  createInitialMatchState,
  type InitialMatchInput,
  type RosterEntry,
} from "./setup";
import { resolveStartOfTurn } from "./start-of-turn";

/**
 * M6-T1 — `createInitialMatchState` against a minimal, non-official fixture.
 *
 * The map/game-data here are a throwaway harness (not `maps.yaml` content) — just
 * enough to prove the builder places units/properties/funds, initializes the
 * pre-first-turn meta, stays pure, and yields a state the first start-of-turn can
 * run on. Real official maps and the commander roster are design-gated (M6 §6).
 */

/** A minimal `GameData` covering only the fields the builder + start-of-turn read. */
function gameData(): GameData {
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
  } as unknown as GameData;
}

/** A tiny non-official map: two HQs, a neutral city, one unit per player. */
function testMap(): InitialMatchInput["map"] {
  return {
    id: "test-map",
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
      { id: "city1", type_id: "city", x: 2, y: 2, initial_owner: "neutral" },
    ],
    starting_units: [
      { id: "u1", type_id: "infantry", owner: "player_1", x: 0, y: 1 },
      { id: "u2", type_id: "tank", owner: "player_2", x: 4, y: 2 },
    ],
    starting_funds: { player_1: 1500, player_2: 1500 },
    balance: { status: "draft" },
  } as unknown as InitialMatchInput["map"];
}

const ROSTER: readonly RosterEntry[] = [
  {
    playerId: "p1",
    userId: "user-1",
    slot: "player_1",
    factionId: "blue",
    commanderId: "cmdr-placeholder-1",
  },
  {
    playerId: "p2",
    userId: "user-2",
    slot: "player_2",
    factionId: "red",
    commanderId: "cmdr-placeholder-2",
  },
];

function input(overrides: Partial<InitialMatchInput> = {}): InitialMatchInput {
  return {
    matchId: "match-1",
    dataVersion: "1.0.0",
    map: testMap(),
    roster: ROSTER,
    firstPlayerId: "p1",
    seed: "seed-abc",
    startedAt: "2026-07-16T00:00:00.000Z",
    fogEnabled: false,
    ...overrides,
  };
}

describe("createInitialMatchState", () => {
  it("initializes the pre-first-turn match meta", () => {
    const state = createInitialMatchState(input(), gameData());
    expect(state.match).toMatchObject({
      id: "match-1",
      status: "active",
      dataVersion: "1.0.0",
      mapId: "test-map",
      stateVersion: 0,
      currentDay: 0,
      activePlayerId: "p1",
      firstPlayerId: "p1",
      deterministicSeed: "seed-abc",
      randomSequenceIndex: 0,
      fogEnabled: false,
      startedAt: "2026-07-16T00:00:00.000Z",
      winnerPlayerId: null,
    });
  });

  it("seats both players with map funds and full readiness", () => {
    const state = createInitialMatchState(input(), gameData());
    expect(state.players).toHaveLength(2);
    const p1 = state.players.find((p) => p.playerId === "p1");
    expect(p1).toMatchObject({
      userId: "user-1",
      factionId: "blue",
      commanderId: "cmdr-placeholder-1",
      funds: 1500,
      powerMeter: 0,
      ready: true,
      resigned: false,
    });
  });

  it("places starting units at full state, owned by the slot's player", () => {
    const state = createInitialMatchState(input(), gameData());
    expect(state.units).toHaveLength(2);
    const tank = state.units.find((u) => u.id === "u2");
    expect(tank).toMatchObject({
      typeId: "tank",
      ownerPlayerId: "p2",
      position: { x: 4, y: 2 },
      trueHp: 100,
      fuel: 70,
      ammo: 9,
      hasActed: false,
      cargoUnitIds: [],
      specialState: null,
      createdTurn: 0,
    });
    // A unit with null max_ammo starts at 0 ammo.
    expect(state.units.find((u) => u.id === "u1")?.ammo).toBe(0);
  });

  it("places properties with mapped ownership and full capture points", () => {
    const state = createInitialMatchState(input(), gameData());
    expect(state.properties).toHaveLength(3);
    expect(state.properties.find((p) => p.id === "hq1")?.ownerPlayerId).toBe(
      "p1",
    );
    expect(state.properties.find((p) => p.id === "hq2")?.ownerPlayerId).toBe(
      "p2",
    );
    // The neutral city has no owner.
    expect(
      state.properties.find((p) => p.id === "city1")?.ownerPlayerId,
    ).toBeNull();
    expect(state.properties.every((p) => p.capturePointsRemaining === 20)).toBe(
      true,
    );
  });

  it("is deterministic and does not mutate its input", () => {
    const frozenInput = input();
    const a = createInitialMatchState(frozenInput, gameData());
    const b = createInitialMatchState(frozenInput, gameData());
    expect(a).toEqual(b);
    // The roster passed in is untouched.
    expect(frozenInput.roster).toBe(ROSTER);
    expect(ROSTER[0].playerId).toBe("p1");
  });

  it("yields a state the first start-of-turn can run, landing Day 1", () => {
    const state = createInitialMatchState(input(), gameData());
    expect(state.match.lastActionAt).toBeNull();
    const { nextState, events } = resolveStartOfTurn(state, gameData());
    expect(nextState.match.currentDay).toBe(1);
    // start-of-turn resets the late-action marker.
    expect(nextState.match.lastActionAt).toBeNull();
    expect(events.some((e) => e.type === "turn_started")).toBe(true);
  });

  it("rejects a first player outside the roster", () => {
    expect(() =>
      createInitialMatchState(input({ firstPlayerId: "ghost" }), gameData()),
    ).toThrow();
  });

  it("rejects a roster that is not exactly the two slots", () => {
    expect(() =>
      createInitialMatchState(input({ roster: [ROSTER[0]] }), gameData()),
    ).toThrow();
  });

  it("rejects a map unit whose type is not in game data", () => {
    const badMap = testMap();
    (badMap as { starting_units: unknown[] }).starting_units = [
      { id: "x", type_id: "nonesuch", owner: "player_1", x: 0, y: 0 },
    ];
    expect(() =>
      createInitialMatchState(input({ map: badMap }), gameData()),
    ).toThrow();
  });
});
