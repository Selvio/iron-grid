import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import { resolveStartOfTurn } from "./start-of-turn";
import type {
  MatchMeta,
  MatchState,
  PlayerState,
  PropertyState,
  UnitState,
} from "./state";

/**
 * M2-T2: `resolveStartOfTurn` runs the canonical ordered transaction — income
 * (§6.2), daily fuel and destruction (§17.2–§17.3, §35 #20), action-flag reset —
 * deterministically and without mutating its input.
 *
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T2)
 */

/**
 * A minimal `GameData` exposing only the fields `resolveStartOfTurn` reads: unit
 * category + daily fuel, and per-property income. Cast because the real shape
 * carries far more that this transaction never consults.
 */
function gameData(): GameData {
  return {
    units: {
      infantry: {
        category: "ground",
        logistics: { daily_fuel: { default: 0 } },
      },
      fighter: { category: "air", logistics: { daily_fuel: { default: 5 } } },
      lander: { category: "naval", logistics: { daily_fuel: { default: 1 } } },
      submarine: {
        category: "naval",
        logistics: { daily_fuel: { surfaced: 1, submerged: 5 } },
      },
    },
    properties: {
      city: { economy: { income_per_turn: 1000 } },
      headquarters: { economy: { income_per_turn: 1000 } },
      silo: { economy: { income_per_turn: 0 } },
    },
  } as unknown as GameData;
}

function unit(
  id: string,
  typeId: string,
  ownerPlayerId: string,
  patch: Partial<UnitState> = {},
): UnitState {
  return {
    id,
    typeId,
    ownerPlayerId,
    position: { x: 1, y: 1 },
    trueHp: 100,
    fuel: 99,
    ammo: 0,
    hasActed: false,
    captureTargetPropertyId: null,
    cargoUnitIds: [],
    specialState: null,
    createdTurn: 0,
    ...patch,
  };
}

function property(
  id: string,
  typeId: string,
  ownerPlayerId: string | null,
  x: number,
  y: number,
): PropertyState {
  return {
    id,
    typeId,
    position: { x, y },
    ownerPlayerId,
    capturePointsRemaining: 20,
    capturingUnitId: null,
  };
}

function player(playerId: string, funds: number): PlayerState {
  return {
    playerId,
    userId: `u_${playerId}`,
    factionId: "blue",
    commanderId: "commander_blue",
    funds,
    powerMeter: 0,
    ready: true,
    resigned: false,
  };
}

function match(patch: Partial<MatchMeta> = {}): MatchMeta {
  return {
    id: "m1",
    status: "active",
    dataVersion: "1.0.0",
    mapId: "map1",
    stateVersion: 1,
    currentDay: 1,
    activePlayerId: "p1",
    firstPlayerId: "p1",
    startedAt: null,
    completedAt: null,
    winnerPlayerId: null,
    completionReason: null,
    turnDeadlineAt: "2026-07-13T00:00:00Z",
    expiredTurnClaimAvailableTo: null,
    deterministicSeed: "seed",
    randomSequenceIndex: 0,
    ...patch,
  };
}

function state(patch: Partial<MatchState> = {}): MatchState {
  return {
    match: match(),
    players: [player("p1", 1000), player("p2", 1000)],
    units: [],
    properties: [],
    terrainObjects: [],
    ...patch,
  };
}

describe("income (§6.2)", () => {
  it("credits 1,000 per owned income-producing property, and nothing else", () => {
    const s = state({
      properties: [
        property("h1", "headquarters", "p1", 1, 1),
        property("c1", "city", "p1", 2, 1),
        property("c2", "city", null, 3, 1), // neutral — no income
        property("c3", "city", "p2", 4, 1), // opponent — no income
        property("s1", "silo", "p1", 5, 1), // configured to zero income
      ],
    });

    const { nextState, events } = resolveStartOfTurn(s, gameData());

    expect(nextState.players.find((p) => p.playerId === "p1")?.funds).toBe(
      3000,
    );
    const income = events.find((e) => e.type === "income_granted");
    expect(income).toEqual({
      type: "income_granted",
      playerId: "p1",
      amount: 2000,
      fundsAfter: 3000,
    });
  });

  it("emits no income event when the active player owns no producing property", () => {
    const s = state({ properties: [property("c2", "city", "p2", 1, 1)] });
    const { events } = resolveStartOfTurn(s, gameData());
    expect(events.some((e) => e.type === "income_granted")).toBe(false);
  });
});

describe("daily fuel and destruction (§17.2–§17.3, §35 #20)", () => {
  it("destroys an air unit that cannot pay, keeps a ground unit at zero fuel", () => {
    const s = state({
      units: [
        unit("air", "fighter", "p1", { fuel: 3 }), // burns 5 → cannot pay
        unit("ground", "infantry", "p1", { fuel: 0 }), // burns 0 → survives
      ],
    });

    const { nextState, events } = resolveStartOfTurn(s, gameData());

    expect(nextState.units.map((u) => u.id)).toEqual(["ground"]);
    expect(events).toContainEqual({
      type: "unit_destroyed",
      unitId: "air",
      reason: "daily_fuel",
    });
    // The destroyed unit is never debited fuel, and the ground unit emits nothing.
    expect(events.some((e) => e.type === "fuel_consumed")).toBe(false);
  });

  it("debits daily fuel from a unit that can pay", () => {
    const s = state({ units: [unit("air", "fighter", "p1", { fuel: 8 })] });
    const { nextState, events } = resolveStartOfTurn(s, gameData());
    expect(nextState.units[0]?.fuel).toBe(3);
    expect(events).toContainEqual({
      type: "fuel_consumed",
      unitId: "air",
      amount: 5,
      fuelAfter: 3,
    });
  });

  it("burns the submerged rate for a diving submarine", () => {
    const s = state({
      units: [
        unit("sub", "submarine", "p1", { fuel: 10, specialState: "submerged" }),
      ],
    });
    const { nextState } = resolveStartOfTurn(s, gameData());
    expect(nextState.units[0]?.fuel).toBe(5); // submerged burns 5, not 1
  });

  it("only processes the active player's units", () => {
    const s = state({
      units: [unit("enemyAir", "fighter", "p2", { fuel: 3, hasActed: true })],
    });
    const { nextState, events } = resolveStartOfTurn(s, gameData());
    // p2's unpayable air unit is untouched — it is not p2's turn.
    expect(nextState.units.map((u) => u.id)).toEqual(["enemyAir"]);
    expect(nextState.units[0]?.hasActed).toBe(true);
    expect(events.some((e) => e.type === "unit_destroyed")).toBe(false);
  });

  it("does not charge daily fuel to loaded cargo (frozen inside its transport)", () => {
    const s = state({
      // A carried air unit with no board position and too little fuel to pay: it
      // must survive because its fuel is frozen while loaded (§16.2), not burned.
      units: [unit("cargoAir", "fighter", "p1", { fuel: 1, position: null })],
    });
    const { nextState, events } = resolveStartOfTurn(s, gameData());
    expect(nextState.units.map((u) => u.id)).toEqual(["cargoAir"]);
    expect(nextState.units[0]?.fuel).toBe(1); // untouched
    expect(events.some((e) => e.type === "unit_destroyed")).toBe(false);
    expect(events.some((e) => e.type === "fuel_consumed")).toBe(false);
  });
});

describe("action-flag reset and deadline signal", () => {
  it("clears hasActed for the active player's surviving units only", () => {
    const s = state({
      units: [
        unit("mine", "infantry", "p1", { hasActed: true }),
        unit("theirs", "infantry", "p2", { hasActed: true }),
      ],
    });
    const { nextState } = resolveStartOfTurn(s, gameData());
    expect(nextState.units.find((u) => u.id === "mine")?.hasActed).toBe(false);
    expect(nextState.units.find((u) => u.id === "theirs")?.hasActed).toBe(true);
  });

  it("clears the previous turn's deadline so the backend restamps it", () => {
    const { nextState } = resolveStartOfTurn(state(), gameData());
    expect(nextState.match.turnDeadlineAt).toBeNull();
  });
});

describe("turn/day advance and events (day_definition)", () => {
  it("advances the day when the turn returns to the first player", () => {
    const s = state({
      match: match({
        currentDay: 1,
        activePlayerId: "p1",
        firstPlayerId: "p1",
      }),
    });
    const { nextState, events } = resolveStartOfTurn(s, gameData());
    expect(nextState.match.currentDay).toBe(2);
    expect(events.at(-1)).toEqual({
      type: "turn_started",
      playerId: "p1",
      day: 2,
    });
  });

  it("holds the day when the turn passes to a non-first player", () => {
    const s = state({
      match: match({
        currentDay: 2,
        activePlayerId: "p2",
        firstPlayerId: "p1",
      }),
    });
    const { nextState, events } = resolveStartOfTurn(s, gameData());
    expect(nextState.match.currentDay).toBe(2);
    expect(events.at(-1)).toEqual({
      type: "turn_started",
      playerId: "p2",
      day: 2,
    });
  });

  it("emits events in canonical step order: income, fuel, destroy, turn_started", () => {
    const s = state({
      properties: [property("c1", "city", "p1", 1, 1)],
      units: [
        unit("payer", "fighter", "p1", { fuel: 8, position: { x: 1, y: 1 } }),
        unit("doomed", "fighter", "p1", { fuel: 1, position: { x: 2, y: 1 } }),
      ],
    });
    const { events } = resolveStartOfTurn(s, gameData());
    expect(events.map((e) => e.type)).toEqual([
      "income_granted",
      "fuel_consumed",
      "unit_destroyed",
      "turn_started",
    ]);
  });
});

describe("purity and determinism", () => {
  it("does not mutate its input", () => {
    const s = state({
      properties: [property("c1", "city", "p1", 1, 1)],
      units: [
        unit("air", "fighter", "p1", { fuel: 3, hasActed: true }),
        unit("foot", "infantry", "p1", { hasActed: true }),
      ],
    });
    const snapshot = JSON.stringify(s);
    resolveStartOfTurn(s, gameData());
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("yields identical output on repeated calls with equal input", () => {
    const s = state({
      properties: [property("c1", "city", "p1", 1, 1)],
      units: [unit("air", "fighter", "p1", { fuel: 8 })],
    });
    const a = resolveStartOfTurn(s, gameData());
    const b = resolveStartOfTurn(s, gameData());
    expect(a).toEqual(b);
  });
});

describe("invariant guards", () => {
  it("throws when the match is not active", () => {
    const s = state({ match: match({ status: "completed" }) });
    expect(() => resolveStartOfTurn(s, gameData())).toThrow(/not active/);
  });

  it("throws when the active player is not a match player", () => {
    const s = state({ match: match({ activePlayerId: "ghost" }) });
    expect(() => resolveStartOfTurn(s, gameData())).toThrow(
      /not a match player/,
    );
  });
});
