import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import { calculateLegalActions } from "./legal-actions";
import type {
  Coordinate,
  MatchMeta,
  MatchState,
  PlayerState,
  UnitState,
} from "./state";

/**
 * M2-T5: `calculateLegalActions` enumerates a `move_and_wait` per idle unit (its
 * reachable tiles plus its own tile) and one `end_turn`, in board order, only for
 * the active player of an active match.
 *
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T5)
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

function makeGameData(grid: readonly string[][]): GameData {
  return {
    units: {
      tank: { category: "ground", movement: { type: "treads", points: 6 } },
    },
    terrain: { plain: { movement_costs: PLAIN } },
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
): MatchState {
  return {
    match: match(patch),
    players: [player("p1"), player("p2")],
    units,
    properties: [],
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
});
