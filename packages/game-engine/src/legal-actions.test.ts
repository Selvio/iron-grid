import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import { calculateLegalActions } from "./legal-actions";
import type {
  Coordinate,
  Id,
  MatchMeta,
  MatchState,
  PropertyState,
  PlayerState,
  UnitState,
} from "./state";

/**
 * `calculateLegalActions` enumerates, per idle unit, a `move_and_wait` (its
 * reachable tiles plus its own tile), a `capture` and an `attack` when available,
 * plus one `end_turn` — in board order, only for the active player of an active
 * match (M2-T5; attack/capture enumeration added in M10-T6).
 *
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T5)
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T6)
 */

const PLAIN = {
  foot: 1,
  mech: 1,
  tires: 2,
  treads: 1,
  air: 1,
  ship: null,
  transport_ship: null,
} as const;

/** A direct 1-range unit that may move-and-fire; `infantry` can also capture. */
const UNIT_DEFS = {
  tank: {
    category: "ground",
    movement: { type: "treads", points: 6, can_move_and_attack: true },
    combat: { type: "direct", min_range: 1, max_range: 1 },
    capabilities: { can_capture: false },
    logistics: { primary_ammo_per_attack: 1 },
  },
  infantry: {
    category: "ground",
    movement: {
      type: "foot",
      points: 3,
      can_move_and_attack: true,
      can_move_and_capture: true,
    },
    combat: { type: "direct", min_range: 1, max_range: 1 },
    capabilities: { can_capture: true },
    logistics: { primary_ammo_per_attack: 0 },
  },
} as const;

/** A tiny damage chart so `selectWeapon` finds a legal weapon for the matchups. */
const DAMAGE_CHART = {
  attackers: {
    tank: {
      matchups: {
        tank: {
          weapon_values: { primary: { weapon_id: "cannon", base_damage: 55 } },
        },
        infantry: {
          weapon_values: { secondary: { weapon_id: "mg", base_damage: 75 } },
        },
      },
    },
    infantry: {
      matchups: {
        tank: {
          weapon_values: { primary: { weapon_id: "rifle", base_damage: 5 } },
        },
      },
    },
  },
} as const;

function makeGameData(grid: readonly string[][]): GameData {
  return {
    units: UNIT_DEFS,
    terrain: { plain: { movement_costs: PLAIN } },
    properties: {
      city: { capturable: true, max_capture_points: 20 },
      headquarters: { capturable: true, max_capture_points: 20 },
    },
    damageChart: DAMAGE_CHART,
    maps: {
      m: {
        dimensions: { width: grid[0]!.length, height: grid.length },
        logical_terrain: grid,
      },
    },
  } as unknown as GameData;
}

function property(
  id: string,
  typeId: string,
  position: Coordinate,
  ownerPlayerId: Id | null,
): PropertyState {
  return {
    id,
    typeId,
    position,
    ownerPlayerId,
    capturePointsRemaining: 20,
    capturingUnitId: null,
  };
}

function unit(
  id: string,
  ownerPlayerId: string,
  position: Coordinate | null,
  patch: Partial<UnitState> = {},
): UnitState {
  return {
    id,
    typeId: "tank",
    ownerPlayerId,
    position,
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

function player(playerId: string): PlayerState {
  return {
    playerId,
    userId: `u_${playerId}`,
    factionId: "blue",
    commanderId: "commander_blue",
    funds: 0,
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
    ...patch,
  };
}

function state(
  units: readonly UnitState[],
  patch: Partial<MatchMeta> = {},
  properties: readonly PropertyState[] = [],
): MatchState {
  return {
    match: match(patch),
    players: [player("p1"), player("p2")],
    units,
    properties,
    terrainObjects: [],
  };
}

const PLAIN_1x3 = [["plain", "plain", "plain"]];

describe("calculateLegalActions", () => {
  it("offers a move_and_wait per idle unit plus end_turn, in board order", () => {
    const gd = makeGameData(PLAIN_1x3);
    const s = state([
      unit("b", "p1", { x: 2, y: 0 }),
      unit("a", "p1", { x: 0, y: 0 }),
    ]);

    const actions = calculateLegalActions(s, "p1", gd);
    expect(actions.map((a) => a.type)).toEqual([
      "move_and_wait", // unit a at x=0 comes first
      "move_and_wait", // unit b at x=2
      "end_turn",
    ]);
    expect(actions[0]?.unitId).toBe("a");
    expect(actions[1]?.unitId).toBe("b");
    expect(actions.at(-1)).toEqual({ type: "end_turn" });
  });

  it("includes the unit's own tile among its destinations (waiting in place)", () => {
    const gd = makeGameData(PLAIN_1x3);
    const s = state([unit("a", "p1", { x: 0, y: 0 })]);
    const [moveAction] = calculateLegalActions(s, "p1", gd);
    const keys = (moveAction?.destinations ?? []).map((c) => `${c.x},${c.y}`);
    expect(keys).toContain("0,0"); // the origin is a legal (wait) destination
    expect(keys).toContain("1,0"); // and reachable tiles too
  });

  it("offers no move for a unit that has already acted", () => {
    const gd = makeGameData(PLAIN_1x3);
    const s = state([unit("a", "p1", { x: 0, y: 0 }, { hasActed: true })]);
    const actions = calculateLegalActions(s, "p1", gd);
    expect(actions).toEqual([{ type: "end_turn" }]);
  });

  it("skips loaded cargo with no board position", () => {
    const gd = makeGameData(PLAIN_1x3);
    const s = state([unit("a", "p1", null)]);
    expect(calculateLegalActions(s, "p1", gd)).toEqual([{ type: "end_turn" }]);
  });

  it("returns nothing for a player whose turn it is not", () => {
    const gd = makeGameData(PLAIN_1x3);
    const s = state([unit("a", "p2", { x: 0, y: 0 })]);
    expect(calculateLegalActions(s, "p2", gd)).toEqual([]);
  });

  it("returns nothing when the match is not active", () => {
    const gd = makeGameData(PLAIN_1x3);
    const s = state([unit("a", "p1", { x: 0, y: 0 })], { status: "completed" });
    expect(calculateLegalActions(s, "p1", gd)).toEqual([]);
  });

  it("offers an attack against an adjacent enemy, from the origin and move tiles", () => {
    const gd = makeGameData(PLAIN_1x3);
    // p1 tank at x=0, p2 tank at x=2 on a 1×3 strip; the empty x=1 is a firing tile.
    const s = state([
      unit("a", "p1", { x: 0, y: 0 }, { ammo: 9 }),
      unit("e", "p2", { x: 2, y: 0 }, { ammo: 9 }),
    ]);
    const actions = calculateLegalActions(s, "p1", gd);

    const attack = actions.find((x) => x.type === "attack");
    expect(attack?.unitId).toBe("a");
    // The only tile adjacent to the enemy the tank can reach/hit from is x=1.
    expect(attack?.attacks).toEqual([
      { from: { x: 1, y: 0 }, targetUnitId: "e" },
    ]);
    // move_and_wait precedes attack for the same unit.
    expect(actions.map((x) => x.type)).toEqual([
      "move_and_wait",
      "attack",
      "end_turn",
    ]);
  });

  it("omits attack when no enemy is in range, and out-of-ammo cannons cannot fire", () => {
    const gd = makeGameData([["plain", "plain", "plain", "plain", "plain"]]);
    // Enemy is 4 tiles away — a treads-6 tank reaches x=1..? but the only weapon
    // vs a tank is the ammo-gated primary; with ammo 0 there is no legal weapon.
    const s = state([
      unit("a", "p1", { x: 0, y: 0 }, { ammo: 0 }),
      unit("e", "p2", { x: 4, y: 0 }, { ammo: 9 }),
    ]);
    const actions = calculateLegalActions(s, "p1", gd);
    expect(actions.some((x) => x.type === "attack")).toBe(false);
  });

  it("offers a capture for an infantry standing on a capturable enemy property", () => {
    const gd = makeGameData(PLAIN_1x3);
    const s = state(
      [unit("i", "p1", { x: 0, y: 0 }, { typeId: "infantry", ammo: 0 })],
      {},
      [property("c", "city", { x: 0, y: 0 }, "p2")],
    );
    const actions = calculateLegalActions(s, "p1", gd);

    const capture = actions.find((x) => x.type === "capture");
    expect(capture?.unitId).toBe("i");
    // Capture-in-place: the origin tile carrying the enemy city.
    expect(capture?.destinations).toContainEqual({ x: 0, y: 0 });
    expect(actions.map((x) => x.type)).toEqual([
      "move_and_wait",
      "capture",
      "end_turn",
    ]);
  });

  it("does not offer a capture for a non-capturing unit or an own property", () => {
    const gd = makeGameData(PLAIN_1x3);
    // A tank cannot capture; and even infantry cannot capture a property it owns.
    const s = state(
      [
        unit("t", "p1", { x: 0, y: 0 }, { typeId: "tank", ammo: 0 }),
        unit("i", "p1", { x: 2, y: 0 }, { typeId: "infantry", ammo: 0 }),
      ],
      {},
      [
        property("c1", "city", { x: 0, y: 0 }, "p2"), // enemy, but tank can't capture
        property("c2", "city", { x: 2, y: 0 }, "p1"), // own, infantry can't capture
      ],
    );
    const actions = calculateLegalActions(s, "p1", gd);
    expect(actions.some((x) => x.type === "capture")).toBe(false);
  });
});
