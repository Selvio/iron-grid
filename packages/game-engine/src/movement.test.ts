import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import { calculateMovementRange, validateMovementPath } from "./movement";
import type {
  Coordinate,
  MatchMeta,
  MatchState,
  PlayerState,
  UnitState,
} from "./state";

/**
 * M2-T3: movement reachability and path validation — orthogonal, cost-bounded by
 * movement points and tile-bounded by fuel (one per tile, §10.3), with enemy
 * units blocking and friendly units passable but not valid destinations (§10.2).
 *
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T3)
 */

/** Movement costs by type for the handful of terrains these tests use. */
const TERRAIN = {
  plain: {
    foot: 1,
    mech: 1,
    tires: 2,
    treads: 1,
    air: 1,
    ship: null,
    transport_ship: null,
  },
  forest: {
    foot: 1,
    mech: 1,
    tires: 3,
    treads: 2,
    air: 1,
    ship: null,
    transport_ship: null,
  },
  sea: {
    foot: null,
    mech: null,
    tires: null,
    treads: null,
    air: 1,
    ship: 1,
    transport_ship: 1,
  },
  pipe: {
    foot: null,
    mech: null,
    tires: null,
    treads: null,
    air: null,
    ship: null,
    transport_ship: null,
  },
} as const;

/**
 * A minimal `GameData` exposing only what movement reads: unit movement type +
 * points, terrain movement costs, and the map's grid/dimensions.
 */
function makeGameData(grid: readonly string[][]): GameData {
  return {
    units: {
      tank: { category: "ground", movement: { type: "treads", points: 6 } },
      recon: { category: "ground", movement: { type: "tires", points: 8 } },
      infantry: { category: "ground", movement: { type: "foot", points: 3 } },
      slow: { category: "ground", movement: { type: "treads", points: 2 } },
    },
    terrain: {
      plain: { movement_costs: TERRAIN.plain },
      forest: { movement_costs: TERRAIN.forest },
      sea: { movement_costs: TERRAIN.sea },
      pipe: { movement_costs: TERRAIN.pipe },
    },
    maps: {
      m: {
        dimensions: { width: grid[0]!.length, height: grid.length },
        logical_terrain: grid,
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

/** Reachable tiles as a sorted set of "x,y" for order-independent comparison. */
function reachKeys(reachable: readonly Coordinate[]): string[] {
  return reachable.map((c) => `${c.x},${c.y}`).sort();
}

const PLAIN_3x3 = [
  ["plain", "plain", "plain"],
  ["plain", "plain", "plain"],
  ["plain", "plain", "plain"],
];

/** A one-row corridor, useful for isolating pass-through and blocking. */
function corridor(...tiles: string[]): string[][] {
  return [tiles];
}

describe("calculateMovementRange", () => {
  it("reaches every open tile within the movement budget, excluding the origin", () => {
    const gd = makeGameData(PLAIN_3x3);
    const s = state([unit("t", "tank", "p1", { x: 1, y: 1 })]);
    const { reachable } = calculateMovementRange(s, "t", gd);
    expect(reachKeys(reachable)).toEqual([
      "0,0",
      "0,1",
      "0,2",
      "1,0",
      "1,2",
      "2,0",
      "2,1",
      "2,2",
    ]); // all eight neighbors; the origin 1,1 is not a destination
  });

  it("shrinks the range when fuel is below the movement points", () => {
    const gd = makeGameData(PLAIN_3x3);
    const s = state([unit("t", "tank", "p1", { x: 1, y: 1 }, { fuel: 1 })]);
    const { reachable } = calculateMovementRange(s, "t", gd);
    // One fuel → at most one tile, so only the four orthogonal neighbors.
    expect(reachKeys(reachable)).toEqual(["0,1", "1,0", "1,2", "2,1"]);
  });

  it("cannot enter or pass through an enemy unit", () => {
    const gd = makeGameData(
      corridor("plain", "plain", "plain", "plain", "plain"),
    );
    const s = state([
      unit("t", "tank", "p1", { x: 0, y: 0 }),
      unit("e", "tank", "p2", { x: 2, y: 0 }),
    ]);
    const { reachable } = calculateMovementRange(s, "t", gd);
    expect(reachKeys(reachable)).toEqual(["1,0"]); // blocked at the enemy tile
  });

  it("passes through a friendly unit but does not end on it", () => {
    const gd = makeGameData(
      corridor("plain", "plain", "plain", "plain", "plain"),
    );
    const s = state([
      unit("t", "tank", "p1", { x: 0, y: 0 }),
      unit("f", "tank", "p1", { x: 2, y: 0 }),
    ]);
    const { reachable } = calculateMovementRange(s, "t", gd);
    expect(reachKeys(reachable)).toEqual(["1,0", "3,0", "4,0"]); // 2,0 passable, not a destination
  });

  it("excludes tiles impassable to the unit's movement type", () => {
    const gd = makeGameData(
      corridor("plain", "plain", "sea", "plain", "plain"),
    );
    const s = state([unit("t", "tank", "p1", { x: 0, y: 0 })]);
    const { reachable } = calculateMovementRange(s, "t", gd);
    expect(reachKeys(reachable)).toEqual(["1,0"]); // treads cannot cross sea
  });

  it("treats a Pipe barrier as impassable to every movement type", () => {
    const gd = makeGameData(corridor("plain", "pipe", "plain"));
    const s = state([unit("t", "tank", "p1", { x: 0, y: 0 })]);
    expect(reachKeys(calculateMovementRange(s, "t", gd).reachable)).toEqual([]);
  });

  it("returns no range for loaded cargo with no board position", () => {
    const gd = makeGameData(PLAIN_3x3);
    const s = state([unit("t", "tank", "p1", null)]);
    expect(calculateMovementRange(s, "t", gd).reachable).toEqual([]);
  });

  it("does not mutate the input state", () => {
    const gd = makeGameData(PLAIN_3x3);
    const s = state([unit("t", "tank", "p1", { x: 1, y: 1 })]);
    const snapshot = JSON.stringify(s);
    calculateMovementRange(s, "t", gd);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe("validateMovementPath (§35 #4, #5)", () => {
  it("#4: a Tank spends tread movement cost but one fuel per tile", () => {
    const gd = makeGameData(corridor("plain", "forest", "plain"));
    const s = state([unit("t", "tank", "p1", { x: 0, y: 0 })]);
    const result = validateMovementPath(
      s,
      "t",
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      gd,
    );
    expect(result.valid).toBe(true);
    expect(result.movementCost).toBe(3); // forest treads 2 + plain treads 1
    expect(result.fuelCost).toBe(2); // one per traversed tile, not per cost
  });

  it("#5: a Recon pays the higher Tire cost while still spending one fuel per tile", () => {
    const gd = makeGameData(corridor("plain", "forest", "plain"));
    const s = state([unit("r", "recon", "p1", { x: 0, y: 0 })]);
    const result = validateMovementPath(
      s,
      "r",
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      gd,
    );
    expect(result.valid).toBe(true);
    expect(result.movementCost).toBe(5); // forest tires 3 + plain tires 2
    expect(result.fuelCost).toBe(2);
  });

  it("rejects a path that does not start on the unit's tile", () => {
    const gd = makeGameData(PLAIN_3x3);
    const s = state([unit("t", "tank", "p1", { x: 0, y: 0 })]);
    const result = validateMovementPath(s, "t", [{ x: 1, y: 0 }], gd);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("invalid_path");
  });

  it("rejects a diagonal step", () => {
    const gd = makeGameData(PLAIN_3x3);
    const s = state([unit("t", "tank", "p1", { x: 0, y: 0 })]);
    const result = validateMovementPath(
      s,
      "t",
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      gd,
    );
    expect(result.errors.map((e) => e.code)).toContain("invalid_path");
  });

  it("rejects passing through an enemy unit", () => {
    const gd = makeGameData(corridor("plain", "plain", "plain"));
    const s = state([
      unit("t", "tank", "p1", { x: 0, y: 0 }),
      unit("e", "tank", "p2", { x: 1, y: 0 }),
    ]);
    const result = validateMovementPath(
      s,
      "t",
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      gd,
    );
    expect(result.errors.map((e) => e.code)).toContain("path_blocked");
  });

  it("rejects an impassable tile", () => {
    const gd = makeGameData(corridor("plain", "sea"));
    const s = state([unit("t", "tank", "p1", { x: 0, y: 0 })]);
    const result = validateMovementPath(
      s,
      "t",
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      gd,
    );
    expect(result.errors.map((e) => e.code)).toContain("path_blocked");
  });

  it("rejects a path that exceeds the unit's movement points", () => {
    const gd = makeGameData(corridor("plain", "forest", "plain")); // treads 1+2+...
    const s = state([unit("t", "slow", "p1", { x: 0, y: 0 })]); // only 2 points
    const result = validateMovementPath(
      s,
      "t",
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      gd,
    );
    expect(result.movementCost).toBe(3); // exceeds the 2 available points
    expect(result.errors.map((e) => e.code)).toContain("insufficient_movement");
  });

  it("rejects a path that exceeds the unit's fuel", () => {
    const gd = makeGameData(corridor("plain", "plain", "plain"));
    const s = state([unit("t", "tank", "p1", { x: 0, y: 0 }, { fuel: 1 })]);
    const result = validateMovementPath(
      s,
      "t",
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ],
      gd,
    );
    expect(result.fuelCost).toBe(2);
    expect(result.errors.map((e) => e.code)).toContain("insufficient_fuel");
  });

  it("rejects ending on an occupied tile", () => {
    const gd = makeGameData(corridor("plain", "plain"));
    const s = state([
      unit("t", "tank", "p1", { x: 0, y: 0 }),
      unit("f", "tank", "p1", { x: 1, y: 0 }),
    ]);
    const result = validateMovementPath(
      s,
      "t",
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      gd,
    );
    expect(result.errors.map((e) => e.code)).toContain("destination_occupied");
  });

  it("accepts a zero-length path as a stationary wait", () => {
    const gd = makeGameData(PLAIN_3x3);
    const s = state([unit("t", "tank", "p1", { x: 1, y: 1 })]);
    const result = validateMovementPath(s, "t", [{ x: 1, y: 1 }], gd);
    expect(result.valid).toBe(true);
    expect(result.fuelCost).toBe(0);
    expect(result.movementCost).toBe(0);
  });

  it("rejects a path for loaded cargo with no board position", () => {
    const gd = makeGameData(PLAIN_3x3);
    const s = state([unit("t", "tank", "p1", null)]);
    const result = validateMovementPath(s, "t", [{ x: 0, y: 0 }], gd);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("invalid_unit");
  });
});
