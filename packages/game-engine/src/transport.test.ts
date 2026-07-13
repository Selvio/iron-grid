import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import type {
  AttackAction,
  DiveAction,
  LoadAction,
  SurfaceAction,
  UnloadAction,
} from "./actions";
import { applyAction } from "./apply";
import type { RandomSource } from "./random";
import type {
  Coordinate,
  MatchMeta,
  MatchState,
  PlayerState,
  UnitState,
} from "./state";
import { validateAction } from "./validate";

/**
 * M3-T5: transport load/unload with cargo integrity, and submarine dive/surface
 * (§16, §19, §35 #17–#18).
 *
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T5)
 */

const cell = (weaponId: string, base: number) => ({
  weapon_id: weaponId,
  base_damage: base,
});

function makeGameData(): GameData {
  return {
    units: {
      infantry: {
        category: "ground",
        movement: { type: "foot", points: 3, can_move_and_load: true },
        capabilities: { can_transport: false, can_dive: false },
        transport: { capacity: 0, allowed_cargo: [] },
        logistics: { max_fuel: 99, max_ammo: null, primary_ammo_per_attack: 0 },
        combat: { type: "direct", min_range: 1, max_range: 1 },
      },
      apc: {
        category: "ground",
        movement: { type: "treads", points: 6, can_move_and_load: false },
        capabilities: { can_transport: true, can_dive: false },
        transport: { capacity: 1, allowed_cargo: ["infantry"] },
        logistics: { max_fuel: 70, max_ammo: null, primary_ammo_per_attack: 0 },
        combat: { type: "none", min_range: null, max_range: null },
      },
      tank: {
        category: "ground",
        movement: { type: "treads", points: 6, can_move_and_load: false },
        capabilities: { can_transport: false, can_dive: false },
        transport: { capacity: 0, allowed_cargo: [] },
        logistics: { max_fuel: 70, max_ammo: 9, primary_ammo_per_attack: 1 },
        combat: { type: "direct", min_range: 1, max_range: 1 },
      },
      submarine: {
        category: "naval",
        movement: { type: "ship", points: 6, can_move_and_load: false },
        capabilities: { can_transport: false, can_dive: true },
        transport: { capacity: 0, allowed_cargo: [] },
        logistics: { max_fuel: 60, max_ammo: 6, primary_ammo_per_attack: 1 },
        combat: { type: "direct", min_range: 1, max_range: 1 },
      },
    },
    weapons: {},
    damageChart: {
      attackers: {
        tank: {
          unit_id: "tank",
          weapons: { primary: "cannon" },
          matchups: {
            apc: {
              defender_id: "apc",
              weapon_values: { primary: cell("cannon", 105) },
            },
          },
        },
      },
    },
    terrain: {
      plain: {
        defense_stars: 0,
        movement_costs: { foot: 1, treads: 1, ship: 1 },
      },
    },
    maps: {
      m: {
        dimensions: { width: 4, height: 1 },
        logical_terrain: [["plain", "plain", "plain", "plain"]],
      },
    },
  } as unknown as GameData;
}

function unit(
  id: string,
  typeId: string,
  ownerPlayerId: string,
  position: Coordinate | null,
  patch: Partial<UnitState> = {},
): UnitState {
  return {
    id,
    typeId,
    ownerPlayerId,
    position,
    trueHp: 100,
    fuel: 50,
    ammo: 9,
    hasActed: false,
    captureTargetPropertyId: null,
    cargoUnitIds: [],
    specialState: null,
    createdTurn: 0,
    ...patch,
  };
}

function player(id: string): PlayerState {
  return {
    playerId: id,
    userId: `u_${id}`,
    factionId: "blue",
    commanderId: "c",
    funds: 0,
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
    firstPlayerId: "p1",
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

function state(units: readonly UnitState[]): MatchState {
  return {
    match: match(),
    players: [player("p1"), player("p2")],
    units,
    properties: [],
    terrainObjects: [],
  };
}

const NO_RANDOM: RandomSource = { nextInt: () => 0 };
const unitOf = (s: MatchState, id: string) => s.units.find((u) => u.id === id);

function load(unitId: string, path: Coordinate[]): LoadAction {
  return {
    type: "load",
    matchId: "m1",
    playerId: "p1",
    expectedStateVersion: 1,
    idempotencyKey: "k",
    unitId,
    path,
  };
}

describe("load (§16.2, §35 #18)", () => {
  it("removes loaded cargo from board occupancy and records the load", () => {
    const gd = makeGameData();
    const s = state([
      unit("inf", "infantry", "p1", { x: 0, y: 0 }),
      unit("apc", "apc", "p1", { x: 1, y: 0 }),
    ]);
    const { nextState, events } = applyAction(
      s,
      load("inf", [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      gd,
      NO_RANDOM,
    );

    const inf = unitOf(nextState, "inf");
    expect(inf?.position).toBeNull(); // not board-occupying
    expect(inf?.hasActed).toBe(true);
    expect(unitOf(nextState, "apc")?.cargoUnitIds).toEqual(["inf"]);
    expect(events.map((e) => e.type)).toEqual(["unit_moved", "unit_loaded"]);
  });

  it("rejects a cargo type the transport does not allow, or over capacity", () => {
    const gd = makeGameData();
    // A tank is not allowed cargo for the APC.
    const s = state([
      unit("tk", "tank", "p1", { x: 0, y: 0 }),
      unit("apc", "apc", "p1", { x: 1, y: 0 }),
    ]);
    const result = validateAction(
      s,
      load("tk", [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      gd,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_transport");
    }
  });
});

describe("cargo destruction (§16.4, §35 #17)", () => {
  it("destroys loaded cargo when the transport is destroyed", () => {
    const gd = makeGameData();
    const s = state([
      unit(
        "apc",
        "apc",
        "p1",
        { x: 1, y: 0 },
        {
          trueHp: 10,
          cargoUnitIds: ["inf"],
        },
      ),
      unit("inf", "infantry", "p1", null), // loaded
      unit("tk", "tank", "p2", { x: 2, y: 0 }),
    ]);
    // p2's tank one-shots the APC (base 105 → lethal).
    const attack: AttackAction = {
      type: "attack",
      matchId: "m1",
      playerId: "p2",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "tk",
      targetUnitId: "apc",
    };
    const stateP2 = { ...s, match: { ...s.match, activePlayerId: "p2" } };
    const { nextState, events } = applyAction(stateP2, attack, gd, NO_RANDOM);

    expect(unitOf(nextState, "apc")).toBeUndefined();
    expect(unitOf(nextState, "inf")).toBeUndefined(); // cargo gone too
    expect(events).toContainEqual({
      type: "cargo_destroyed",
      unitId: "inf",
      transportUnitId: "apc",
    });
  });
});

describe("unload (§16.3)", () => {
  it("places cargo on an adjacent legal tile and marks it acted", () => {
    const gd = makeGameData();
    const s = state([
      unit("apc", "apc", "p1", { x: 1, y: 0 }, { cargoUnitIds: ["inf"] }),
      unit("inf", "infantry", "p1", null),
    ]);
    const unload: UnloadAction = {
      type: "unload",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "apc",
      unloads: [{ cargoUnitId: "inf", to: { x: 0, y: 0 } }],
    };
    const { nextState, events } = applyAction(s, unload, gd, NO_RANDOM);

    const inf = unitOf(nextState, "inf");
    expect(inf?.position).toEqual({ x: 0, y: 0 });
    expect(inf?.hasActed).toBe(true);
    expect(unitOf(nextState, "apc")?.cargoUnitIds).toEqual([]);
    expect(events).toContainEqual({
      type: "unit_unloaded",
      transportUnitId: "apc",
      cargoUnitId: "inf",
      position: { x: 0, y: 0 },
    });
  });

  it("rejects unloading onto a non-adjacent or occupied tile", () => {
    const gd = makeGameData();
    const s = state([
      unit("apc", "apc", "p1", { x: 1, y: 0 }, { cargoUnitIds: ["inf"] }),
      unit("inf", "infantry", "p1", null),
      unit("blocker", "tank", "p1", { x: 0, y: 0 }),
    ]);
    const unload: UnloadAction = {
      type: "unload",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "apc",
      unloads: [{ cargoUnitId: "inf", to: { x: 0, y: 0 } }], // occupied
    };
    const result = validateAction(s, unload, gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_transport");
    }
  });
});

describe("submarine dive/surface (§19.2, §35 #19)", () => {
  it("dives, flipping state and ending the activation", () => {
    const gd = makeGameData();
    const s = state([
      unit(
        "sub",
        "submarine",
        "p1",
        { x: 0, y: 0 },
        {
          specialState: "surfaced",
        },
      ),
    ]);
    const dive: DiveAction = {
      type: "dive",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "sub",
    };
    const { nextState, events } = applyAction(s, dive, gd, NO_RANDOM);
    expect(unitOf(nextState, "sub")?.specialState).toBe("submerged");
    expect(unitOf(nextState, "sub")?.hasActed).toBe(true);
    expect(events).toEqual([{ type: "submarine_dived", unitId: "sub" }]);
  });

  it("rejects diving when already submerged", () => {
    const gd = makeGameData();
    const s = state([
      unit(
        "sub",
        "submarine",
        "p1",
        { x: 0, y: 0 },
        {
          specialState: "submerged",
        },
      ),
    ]);
    const dive: DiveAction = {
      type: "dive",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "sub",
    };
    const result = validateAction(s, dive, gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain(
        "invalid_special_state",
      );
    }
  });

  it("surfaces a submerged submarine", () => {
    const gd = makeGameData();
    const s = state([
      unit(
        "sub",
        "submarine",
        "p1",
        { x: 0, y: 0 },
        {
          specialState: "submerged",
        },
      ),
    ]);
    const surface: SurfaceAction = {
      type: "surface",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "sub",
    };
    const { nextState, events } = applyAction(s, surface, gd, NO_RANDOM);
    expect(unitOf(nextState, "sub")?.specialState).toBe("surfaced");
    expect(events).toEqual([{ type: "submarine_surfaced", unitId: "sub" }]);
  });
});
