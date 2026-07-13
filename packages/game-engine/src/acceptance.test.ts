import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import { applyAction } from "./apply";
import type { EndTurnAction, MoveAndWaitAction } from "./actions";
import { calculateLegalActions } from "./legal-actions";
import { validateMovementPath } from "./movement";
import type { RandomSource } from "./random";
import type {
  Coordinate,
  MatchMeta,
  MatchState,
  PlayerState,
  PropertyState,
  UnitState,
} from "./state";

/**
 * M2 acceptance suite (`testing.md`, `game-specification.md` §35): the pure-engine
 * scenarios in scope, driven end-to-end through the public surface — #4 Tank tread
 * path with fuel by tiles, #5 Recon tire penalty, #20 aircraft destroyed on unpaid
 * daily fuel, plus start-of-turn income accrual and a full turn-passing cycle.
 *
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T5, §5 DoD)
 */

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
  forest: {
    foot: 1,
    mech: 1,
    tires: 3,
    treads: 2,
    air: 1,
    ship: null,
    transport_ship: null,
  },
} as const;

// One row: plain, plain, forest, plain, plain, plain.
const MAP_ROW = ["plain", "plain", "forest", "plain", "plain", "plain"];

function gameData(): GameData {
  return {
    units: {
      tank: {
        category: "ground",
        movement: { type: "treads", points: 6 },
        logistics: { daily_fuel: { default: 0 } },
      },
      recon: {
        category: "ground",
        movement: { type: "tires", points: 8 },
        logistics: { daily_fuel: { default: 0 } },
      },
      fighter: {
        category: "air",
        movement: { type: "air", points: 9 },
        logistics: { daily_fuel: { default: 5 } },
      },
    },
    terrain: {
      plain: { movement_costs: COSTS.plain },
      forest: { movement_costs: COSTS.forest },
    },
    properties: { city: { economy: { income_per_turn: 1000 } } },
    maps: {
      m: {
        dimensions: { width: MAP_ROW.length, height: 1 },
        logical_terrain: [MAP_ROW],
      },
    },
  } as unknown as GameData;
}

function unit(
  id: string,
  typeId: string,
  ownerPlayerId: string,
  position: Coordinate,
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

function move(unitId: string, path: readonly Coordinate[]): MoveAndWaitAction {
  return {
    type: "move_and_wait",
    matchId: "m1",
    playerId: "p1",
    expectedStateVersion: 1,
    idempotencyKey: "k",
    unitId,
    path,
  };
}

function endTurn(playerId: string): EndTurnAction {
  return {
    type: "end_turn",
    matchId: "m1",
    playerId,
    expectedStateVersion: 1,
    idempotencyKey: "k",
  };
}

describe("§35 acceptance (M2 scope)", () => {
  it("#4: a Tank traverses a valid tread path and spends fuel by tiles", () => {
    const gd = gameData();
    const s: MatchState = {
      match: match(),
      players: [player("p1"), player("p2")],
      units: [unit("tank", "tank", "p1", { x: 0, y: 0 })],
      properties: [],
      terrainObjects: [],
    };

    // The path crosses a forest (tread cost 2) but fuel is charged per tile.
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const { nextState, events } = applyAction(
      s,
      move("tank", path),
      gd,
      NO_RANDOM,
    );
    const moved = nextState.units.find((u) => u.id === "tank");
    expect(moved?.position).toEqual({ x: 2, y: 0 });
    expect(moved?.fuel).toBe(97); // two tiles → two fuel, not the cost of 3
    expect(events[0]).toMatchObject({
      type: "unit_moved",
      fuelSpent: 2,
      fuelAfter: 97,
    });
  });

  it("#5: a Recon pays the Tire forest penalty while fuel stays one per tile", () => {
    const gd = gameData();
    const s: MatchState = {
      match: match(),
      players: [player("p1"), player("p2")],
      units: [unit("recon", "recon", "p1", { x: 0, y: 0 })],
      properties: [],
      terrainObjects: [],
    };
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const result = validateMovementPath(s, "recon", path, gd);
    expect(result.valid).toBe(true);
    expect(result.movementCost).toBe(5); // plain tires 2 + forest tires 3
    expect(result.fuelCost).toBe(2); // still one per tile
  });

  it("#20 + income + turn-passing: a full two-player cycle", () => {
    const gd = gameData();
    const start: MatchState = {
      match: match({
        activePlayerId: "p1",
        firstPlayerId: "p1",
        currentDay: 1,
      }),
      players: [player("p1", 0), player("p2", 0)],
      units: [
        unit("tank", "tank", "p1", { x: 0, y: 0 }),
        // p2 fighter cannot pay its daily fuel of 5 (only 3 left).
        unit("jet", "fighter", "p2", { x: 5, y: 0 }, { fuel: 3 }),
      ],
      properties: [propertyOwnedBy("hq", "p1")],
      terrainObjects: [],
    };

    // p1 acts, then ends the turn → p2's start-of-turn destroys the starved jet.
    const afterMove = applyAction(
      start,
      move("tank", [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
      gd,
      NO_RANDOM,
    ).nextState;

    const toP2 = applyAction(afterMove, endTurn("p1"), gd, NO_RANDOM);
    expect(toP2.nextState.match.activePlayerId).toBe("p2");
    expect(toP2.nextState.match.currentDay).toBe(1); // p2 is not the first player
    expect(toP2.nextState.units.some((u) => u.id === "jet")).toBe(false); // #20
    expect(toP2.events).toContainEqual({
      type: "unit_destroyed",
      unitId: "jet",
      reason: "daily_fuel",
    });

    // p2 ends the turn → wraps to p1: day advances, p1's HQ grants income,
    // and p1's tank can act again.
    const toP1 = applyAction(toP2.nextState, endTurn("p2"), gd, NO_RANDOM);
    expect(toP1.nextState.match.activePlayerId).toBe("p1");
    expect(toP1.nextState.match.currentDay).toBe(2);
    expect(toP1.nextState.players.find((p) => p.playerId === "p1")?.funds).toBe(
      1000,
    );
    expect(toP1.nextState.units.find((u) => u.id === "tank")?.hasActed).toBe(
      false,
    );

    // The active player now has legal actions again (move + end_turn).
    const legal = calculateLegalActions(toP1.nextState, "p1", gd);
    expect(
      legal.some((a) => a.type === "move_and_wait" && a.unitId === "tank"),
    ).toBe(true);
    expect(legal.at(-1)).toEqual({ type: "end_turn" });
  });

  it("is deterministic: an identical turn resolves identically", () => {
    const gd = gameData();
    const s: MatchState = {
      match: match(),
      players: [player("p1", 0), player("p2", 0)],
      units: [unit("tank", "tank", "p1", { x: 0, y: 0 })],
      properties: [propertyOwnedBy("hq", "p1")],
      terrainObjects: [],
    };
    const a = applyAction(s, endTurn("p1"), gd, NO_RANDOM);
    const b = applyAction(s, endTurn("p1"), gd, NO_RANDOM);
    expect(a).toEqual(b);
  });
});

function propertyOwnedBy(id: string, ownerPlayerId: string): PropertyState {
  return {
    id,
    typeId: "city",
    position: { x: 4, y: 0 },
    ownerPlayerId,
    capturePointsRemaining: 20,
    capturingUnitId: null,
  };
}
