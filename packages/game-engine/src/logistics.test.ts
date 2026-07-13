import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import type { JoinAction, SupplyAction } from "./actions";
import { applyAction } from "./apply";
import { resolveStartOfTurn } from "./start-of-turn";
import type {
  Coordinate,
  MatchMeta,
  MatchState,
  PlayerState,
  PropertyState,
  UnitState,
} from "./state";
import { validateAction } from "./validate";

/**
 * M3-T4: start-of-turn repair/resupply, APC supply, and join (§14, §15,
 * §35 #14–#16).
 *
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T4)
 */

function makeGameData(): GameData {
  const ground = (patch: Record<string, unknown>) => ({
    category: "ground",
    max_true_hp: 100,
    special_states: [],
    movement: { type: "treads", points: 6, can_move_and_join: true },
    capabilities: { can_supply: false, can_capture: false },
    ...patch,
  });
  return {
    units: {
      tank: ground({
        cost: 7000,
        logistics: {
          max_fuel: 70,
          max_ammo: 9,
          primary_ammo_per_attack: 1,
          daily_fuel: { default: 0 },
        },
      }),
      apc: ground({
        cost: 5000,
        capabilities: { can_supply: true, can_capture: false },
        logistics: {
          max_fuel: 70,
          max_ammo: null,
          primary_ammo_per_attack: 0,
          daily_fuel: { default: 0 },
        },
      }),
      fighter: ground({
        cost: 20000,
        category: "air",
        movement: { type: "air", points: 9, can_move_and_join: true },
        logistics: {
          max_fuel: 99,
          max_ammo: 9,
          primary_ammo_per_attack: 1,
          daily_fuel: { default: 5 },
        },
      }),
    },
    properties: {
      city: {
        repair: { categories: ["ground"] },
        economy: { income_per_turn: 1000 },
      },
      airport: {
        repair: { categories: ["air"] },
        economy: { income_per_turn: 1000 },
      },
    },
    terrain: { plain: { movement_costs: { treads: 1, air: 1 } } },
    maps: {
      m: {
        dimensions: { width: 3, height: 1 },
        logical_terrain: [["plain", "plain", "plain"]],
      },
    },
  } as unknown as GameData;
}

function unit(
  id: string,
  typeId: string,
  position: Coordinate,
  patch: Partial<UnitState> = {},
): UnitState {
  return {
    id,
    typeId,
    ownerPlayerId: "p1",
    position,
    trueHp: 100,
    fuel: 70,
    ammo: 9,
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
  position: Coordinate,
): PropertyState {
  return {
    id,
    typeId,
    position,
    ownerPlayerId: "p1",
    capturePointsRemaining: 20,
    capturingUnitId: null,
  };
}

function player(id: string, funds: number): PlayerState {
  return {
    playerId: id,
    userId: `u_${id}`,
    factionId: "blue",
    commanderId: "c",
    funds,
    powerMeter: 0,
    ready: true,
    resigned: false,
  };
}

function match(): MatchMeta {
  return {
    id: "m1",
    status: "active",
    dataVersion: "1.0.0",
    mapId: "m",
    stateVersion: 1,
    currentDay: 1,
    activePlayerId: "p1",
    firstPlayerId: "p2", // active is not first → the day does not advance
    startedAt: null,
    completedAt: null,
    winnerPlayerId: null,
    completionReason: null,
    turnDeadlineAt: null,
    expiredTurnClaimAvailableTo: null,
    deterministicSeed: "seed",
    randomSequenceIndex: 0,
  };
}

function state(
  units: readonly UnitState[],
  properties: readonly PropertyState[],
  funds: number,
): MatchState {
  return {
    match: match(),
    players: [player("p1", funds), player("p2", 0)],
    units,
    properties,
    terrainObjects: [],
  };
}

const NO_RANDOM = { nextInt: () => 0 };
const fundsOf = (s: MatchState) =>
  s.players.find((p) => p.playerId === "p1")?.funds;
const unitOf = (s: MatchState, id: string) => s.units.find((u) => u.id === id);

describe("start-of-turn repair and resupply (§14, §35 #14)", () => {
  it("repairs up to 2 displayed HP, pays funds, and refills fuel/ammo", () => {
    const gd = makeGameData();
    const s = state(
      [unit("t", "tank", { x: 0, y: 0 }, { trueHp: 55, fuel: 50, ammo: 5 })],
      [property("c", "city", { x: 0, y: 0 })],
      5000,
    );
    const { nextState, events } = resolveStartOfTurn(s, gd);

    const t = unitOf(nextState, "t");
    expect(t?.trueHp).toBe(75); // 55 + 2 displayed HP
    expect(t?.fuel).toBe(70); // refilled
    expect(t?.ammo).toBe(9);
    // Income 1000 then repair cost 2 * floor(7000*0.1) = 1400: 5000 + 1000 - 1400.
    expect(fundsOf(nextState)).toBe(4600);
    expect(events).toContainEqual({
      type: "unit_repaired",
      unitId: "t",
      displayedHpRepaired: 2,
      trueHpAfter: 75,
      cost: 1400,
    });
    expect(events).toContainEqual({
      type: "unit_resupplied",
      unitId: "t",
      fuelAfter: 70,
      ammoAfter: 9,
    });
  });

  it("repairs partially when funds are short, never going negative (§14.4)", () => {
    const gd = makeGameData();
    const s = state(
      [unit("t", "tank", { x: 0, y: 0 }, { trueHp: 55 })], // full fuel/ammo
      [property("c", "city", { x: 0, y: 0 })],
      0,
    );
    const { nextState, events } = resolveStartOfTurn(s, gd);
    // Income 1000 affords one 700 step only.
    expect(unitOf(nextState, "t")?.trueHp).toBe(65);
    expect(fundsOf(nextState)).toBe(300);
    expect(events).toContainEqual({
      type: "unit_repaired",
      unitId: "t",
      displayedHpRepaired: 1,
      trueHpAfter: 65,
      cost: 700,
    });
  });

  it("resupplies for free even when no repair is affordable (§14.1)", () => {
    const gd = makeGameData();
    const s = state(
      [unit("f", "fighter", { x: 0, y: 0 }, { trueHp: 55, fuel: 50, ammo: 3 })],
      [property("a", "airport", { x: 0, y: 0 })],
      0,
    );
    const { nextState, events } = resolveStartOfTurn(s, gd);
    // Income 1000 < 2000/step → no repair, but fuel/ammo still refill (then daily
    // fuel of 5 is consumed after the refill).
    expect(events.some((e) => e.type === "unit_repaired")).toBe(false);
    expect(events.some((e) => e.type === "unit_resupplied")).toBe(true);
    expect(unitOf(nextState, "f")?.trueHp).toBe(55); // not repaired
    expect(unitOf(nextState, "f")?.fuel).toBe(94); // 99 refilled − 5 daily
  });
});

describe("APC supply (§14.5, §35 #15)", () => {
  it("refills an adjacent ally's fuel and ammo without repairing HP", () => {
    const gd = makeGameData();
    const s = state(
      [
        unit("apc", "apc", { x: 0, y: 0 }),
        unit("t", "tank", { x: 1, y: 0 }, { trueHp: 40, fuel: 20, ammo: 3 }),
      ],
      [],
      0,
    );
    const supply: SupplyAction = {
      type: "supply",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "apc",
    };
    const { nextState, events } = applyAction(s, supply, gd, NO_RANDOM);

    const t = unitOf(nextState, "t");
    expect(t?.fuel).toBe(70);
    expect(t?.ammo).toBe(9);
    expect(t?.trueHp).toBe(40); // HP untouched
    expect(unitOf(nextState, "apc")?.hasActed).toBe(true);
    expect(events).toContainEqual({
      type: "unit_supplied",
      supplierUnitId: "apc",
      unitId: "t",
      fuelAfter: 70,
      ammoAfter: 9,
    });
  });

  it("rejects a supplier that cannot supply or has no adjacent ally", () => {
    const gd = makeGameData();
    const s = state([unit("t", "tank", { x: 0, y: 0 })], [], 0);
    const supply: SupplyAction = {
      type: "supply",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "t", // a tank cannot supply
    };
    const result = validateAction(s, supply, gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_supply");
    }
  });
});

describe("join (§15, §35 #16)", () => {
  it("combines HP/fuel/ammo into the target and refunds excess", () => {
    const gd = makeGameData();
    const s = state(
      [
        unit("src", "tank", { x: 0, y: 0 }, { trueHp: 60, fuel: 30, ammo: 5 }),
        unit("dst", "tank", { x: 1, y: 0 }, { trueHp: 70, fuel: 40, ammo: 6 }),
      ],
      [],
      0,
    );
    const join: JoinAction = {
      type: "join",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "src",
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    };
    const { nextState, events } = applyAction(s, join, gd, NO_RANDOM);

    expect(unitOf(nextState, "src")).toBeUndefined(); // absorbed
    const dst = unitOf(nextState, "dst");
    expect(dst?.trueHp).toBe(100); // 60 + 70 capped
    expect(dst?.fuel).toBe(69); // (30 − 1 moved) + 40, capped at 70
    expect(dst?.ammo).toBe(9); // 5 + 6 capped
    expect(dst?.hasActed).toBe(true);
    // Excess 30 HP → floor(7000 * 30 / 100) = 2100.
    expect(fundsOf(nextState)).toBe(2100);
    expect(events).toEqual([
      {
        type: "units_joined",
        survivingUnitId: "dst",
        absorbedUnitId: "src",
        trueHpAfter: 100,
        fuelAfter: 69,
        ammoAfter: 9,
        refund: 2100,
      },
    ]);
  });

  it("rejects joining units of different types", () => {
    const gd = makeGameData();
    const s = state(
      [unit("src", "tank", { x: 0, y: 0 }), unit("dst", "apc", { x: 1, y: 0 })],
      [],
      0,
    );
    const join: JoinAction = {
      type: "join",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "src",
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    };
    const result = validateAction(s, join, gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_join");
    }
  });
});
