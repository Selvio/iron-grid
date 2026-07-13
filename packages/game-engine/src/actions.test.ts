import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import { applyAction } from "./apply";
import type { EndTurnAction, MoveAndWaitAction } from "./actions";
import type { RandomSource } from "./random";
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
 * M2-T4: `move_and_wait` and `end_turn` through the validate/apply path — a legal
 * move commits position/fuel/`has_acted` and emits `unit_moved`; an illegal one
 * changes nothing; `end_turn` hands over and resolves the next start-of-turn.
 *
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T4)
 */

/** A RandomSource that fails loudly — M2 actions must draw no randomness. */
const NO_RANDOM: RandomSource = {
  nextInt: () => {
    throw new Error("M2 draws no randomness");
  },
};

const COSTS = {
  plain: {
    foot: 1,
    mech: 1,
    tires: 2,
    treads: 1,
    air: 1,
    ship: null,
    transport_ship: null,
  },
} as const;

function makeGameData(grid: readonly string[][]): GameData {
  return {
    units: {
      tank: {
        category: "ground",
        movement: { type: "treads", points: 6 },
        logistics: { daily_fuel: { default: 0 } },
      },
    },
    terrain: { plain: { movement_costs: COSTS.plain } },
    properties: { city: { economy: { income_per_turn: 1000 } } },
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
  position: Coordinate,
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

function player(playerId: string, funds = 0): PlayerState {
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

function property(id: string, ownerPlayerId: string): PropertyState {
  return {
    id,
    typeId: "city",
    position: { x: 4, y: 0 },
    ownerPlayerId,
    capturePointsRemaining: 20,
    capturingUnitId: null,
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
    players: [player("p1"), player("p2")],
    units: [],
    properties: [],
    terrainObjects: [],
    ...patch,
  };
}

const CORRIDOR = [["plain", "plain", "plain", "plain", "plain"]];

function move(
  path: readonly Coordinate[],
  patch: Partial<MoveAndWaitAction> = {},
): MoveAndWaitAction {
  return {
    type: "move_and_wait",
    matchId: "m1",
    playerId: "p1",
    expectedStateVersion: 1,
    idempotencyKey: "k",
    unitId: "t",
    path,
    ...patch,
  };
}

function endTurn(patch: Partial<EndTurnAction> = {}): EndTurnAction {
  return {
    type: "end_turn",
    matchId: "m1",
    playerId: "p1",
    expectedStateVersion: 1,
    idempotencyKey: "k",
    ...patch,
  };
}

describe("move_and_wait", () => {
  it("commits position, fuel and has_acted, and emits unit_moved", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({ units: [unit("t", "p1", { x: 0, y: 0 })] });
    const action = move([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);

    expect(validateAction(s, action, gd)).toEqual({ valid: true });

    const { nextState, events } = applyAction(s, action, gd, NO_RANDOM);
    const moved = nextState.units.find((u) => u.id === "t");
    expect(moved?.position).toEqual({ x: 2, y: 0 });
    expect(moved?.fuel).toBe(97); // 99 - two traversed tiles
    expect(moved?.hasActed).toBe(true);
    expect(events).toEqual([
      {
        type: "unit_moved",
        unitId: "t",
        path: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        fuelSpent: 2,
        fuelAfter: 97,
      },
    ]);
  });

  it("rejects a unit that has already acted this turn", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({
      units: [unit("t", "p1", { x: 0, y: 0 }, { hasActed: true })],
    });
    const result = validateAction(
      s,
      move([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      gd,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("unit_already_acted");
    }
  });

  it("rejects a move onto an enemy unit", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({
      units: [unit("t", "p1", { x: 0, y: 0 }), unit("e", "p2", { x: 2, y: 0 })],
    });
    const action = move([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(validateAction(s, action, gd).valid).toBe(false);
    expect(() => applyAction(s, action, gd, NO_RANDOM)).toThrow(/illegal/);
  });

  it("rejects a move that exceeds available fuel", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({ units: [unit("t", "p1", { x: 0, y: 0 }, { fuel: 1 })] });
    const action = move([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    const result = validateAction(s, action, gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("insufficient_fuel");
    }
  });

  it("rejects an action from a player whose turn it is not", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({ units: [unit("t", "p2", { x: 0, y: 0 })] });
    const action = move(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      { playerId: "p2", unitId: "t" },
    );
    const result = validateAction(s, action, gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("not_active_player");
    }
  });

  it("applying an illegal action throws and never mutates the input", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({ units: [unit("t", "p1", { x: 0, y: 0 }, { fuel: 0 })] });
    const snapshot = JSON.stringify(s);
    expect(() =>
      applyAction(
        s,
        move([
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ]),
        gd,
        NO_RANDOM,
      ),
    ).toThrow();
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("does not mutate the input on a legal move either", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({ units: [unit("t", "p1", { x: 0, y: 0 })] });
    const snapshot = JSON.stringify(s);
    applyAction(
      s,
      move([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      gd,
      NO_RANDOM,
    );
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe("end_turn", () => {
  it("hands the turn over and resolves the next player's start-of-turn", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({
      players: [player("p1"), player("p2", 500)],
      properties: [property("c1", "p2")], // p2's income-producing city
    });

    const { nextState, events } = applyAction(s, endTurn(), gd, NO_RANDOM);

    expect(nextState.match.activePlayerId).toBe("p2");
    expect(nextState.match.currentDay).toBe(1); // p2 is not the first player
    expect(nextState.players.find((p) => p.playerId === "p2")?.funds).toBe(
      1500,
    );
    expect(events).toEqual([
      { type: "turn_ended", playerId: "p1" },
      {
        type: "income_granted",
        playerId: "p2",
        amount: 1000,
        fundsAfter: 1500,
      },
      { type: "turn_started", playerId: "p2", day: 1 },
    ]);
  });

  it("advances the day and resets flags when the turn wraps to the first player", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({
      match: match({
        activePlayerId: "p2",
        firstPlayerId: "p1",
        currentDay: 1,
      }),
      units: [unit("t", "p1", { x: 0, y: 0 }, { hasActed: true })],
    });

    const { nextState, events } = applyAction(
      s,
      endTurn({ playerId: "p2" }),
      gd,
      NO_RANDOM,
    );

    expect(nextState.match.activePlayerId).toBe("p1");
    expect(nextState.match.currentDay).toBe(2);
    expect(nextState.units.find((u) => u.id === "t")?.hasActed).toBe(false);
    expect(nextState.match.turnDeadlineAt).toBeNull();
    expect(events.at(-1)).toEqual({
      type: "turn_started",
      playerId: "p1",
      day: 2,
    });
  });

  it("the moved unit cannot act again until its next turn", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state({ units: [unit("t", "p1", { x: 0, y: 0 })] });

    // Move, then attempt a second move in the same turn.
    const afterMove = applyAction(
      s,
      move([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      gd,
      NO_RANDOM,
    ).nextState;
    const second = validateAction(
      afterMove,
      move([
        { x: 1, y: 0 },
        { x: 2, y: 0 },
      ]),
      gd,
    );
    expect(second.valid).toBe(false);
    if (!second.valid) {
      expect(second.errors.map((e) => e.code)).toContain("unit_already_acted");
    }
  });
});

describe("unsupported actions", () => {
  it("rejects an action type not yet resolvable in the engine", () => {
    const gd = makeGameData(CORRIDOR);
    const s = state();
    const load = {
      type: "load",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
    } as const;
    const result = validateAction(s, load, gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_action_type");
    }
  });
});
