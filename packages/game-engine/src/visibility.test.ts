import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import type { MoveAndWaitAction } from "./actions";
import { applyAction } from "./apply";
import type { RandomSource } from "./random";
import type {
  Coordinate,
  MatchMeta,
  MatchState,
  PlayerState,
  PropertyState,
  UnitState,
} from "./state";
import { calculateVisibility, projectStateForPlayer } from "./visibility";

/**
 * M3-T6: fog of war — visibility, private projection with hidden terrain and
 * detection, and hidden-collision movement (§18, §35 #21).
 *
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T6)
 */

const detection = (
  forest: boolean,
  reef: boolean,
  sub: boolean,
): Record<string, boolean> => ({
  adjacent_forest: forest,
  adjacent_reef: reef,
  submerged_submarine: sub,
});

function makeGameData(grid: readonly string[][]): GameData {
  const move = { foot: 1, treads: 1, ship: 1, air: 1 };
  return {
    units: {
      infantry: {
        category: "ground",
        movement: { type: "foot", points: 3 },
        vision: {
          base_range: 2,
          mountain_bonus_eligible: true,
          hidden_unit_detection: detection(true, true, false),
        },
      },
      tank: {
        category: "ground",
        movement: { type: "treads", points: 6 },
        vision: {
          base_range: 3,
          mountain_bonus_eligible: false,
          hidden_unit_detection: detection(false, false, false),
        },
      },
      fighter: {
        category: "air",
        movement: { type: "air", points: 9 },
        vision: { base_range: 2, mountain_bonus_eligible: false },
      },
      cruiser: {
        category: "naval",
        movement: { type: "ship", points: 6 },
        vision: {
          base_range: 3,
          mountain_bonus_eligible: false,
          hidden_unit_detection: detection(false, true, true),
        },
      },
      submarine: {
        category: "naval",
        movement: { type: "ship", points: 6 },
        vision: { base_range: 2, mountain_bonus_eligible: false },
      },
    },
    terrain: {
      plain: {
        movement_costs: move,
        fog: { concealment: "none", vision_bonus: { amount: 0 } },
      },
      forest: {
        movement_costs: move,
        fog: { concealment: "ground", vision_bonus: { amount: 0 } },
      },
      reef: {
        movement_costs: move,
        fog: { concealment: "naval", vision_bonus: { amount: 0 } },
      },
      mountain: {
        movement_costs: move,
        fog: { concealment: "none", vision_bonus: { amount: 3 } },
      },
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

function match(fogEnabled: boolean): MatchMeta {
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
    fogEnabled,
  };
}

function state(
  units: readonly UnitState[],
  properties: readonly PropertyState[] = [],
  fogEnabled = true,
): MatchState {
  return {
    match: match(fogEnabled),
    players: [player("p1"), player("p2")],
    units,
    properties,
    terrainObjects: [],
  };
}

const NO_RANDOM: RandomSource = { nextInt: () => 0 };
const has = (tiles: readonly Coordinate[], x: number, y: number) =>
  tiles.some((t) => t.x === x && t.y === y);

describe("calculateVisibility (§18.2–§18.3)", () => {
  it("sees tiles within a unit's vision range", () => {
    const gd = makeGameData([
      ["plain", "plain", "plain", "plain", "plain", "plain", "plain"],
    ]);
    const s = state([unit("t", "tank", "p1", { x: 0, y: 0 })]); // vision 3
    const { visible } = calculateVisibility(s, "p1", gd);
    expect(has(visible, 3, 0)).toBe(true);
    expect(has(visible, 4, 0)).toBe(false);
  });

  it("extends vision with the Mountain bonus for eligible units", () => {
    const gd = makeGameData([
      ["mountain", "plain", "plain", "plain", "plain", "plain", "plain"],
    ]);
    const s = state([unit("i", "infantry", "p1", { x: 0, y: 0 })]); // base 2 + 3
    const { visible } = calculateVisibility(s, "p1", gd);
    expect(has(visible, 5, 0)).toBe(true);
    expect(has(visible, 6, 0)).toBe(false);
  });

  it("reveals a radius around an owned property", () => {
    const gd = makeGameData([["plain", "plain", "plain"]]);
    const s = state(
      [],
      [
        {
          id: "c",
          typeId: "city",
          position: { x: 1, y: 0 },
          ownerPlayerId: "p1",
          capturePointsRemaining: 20,
          capturingUnitId: null,
        },
      ],
    );
    const { visible } = calculateVisibility(s, "p1", gd);
    expect(has(visible, 0, 0)).toBe(true);
    expect(has(visible, 2, 0)).toBe(true);
  });
});

describe("hidden terrain and detection (§18.4, §35 #21)", () => {
  const grid = [["plain", "forest", "plain", "plain"]];

  it("hides a ground unit in Forest without an adjacent detector", () => {
    const gd = makeGameData(grid);
    // p1 tank (no forest detection) sees the tile but cannot reveal the unit.
    const s = state([
      unit("t", "tank", "p1", { x: 0, y: 0 }),
      unit("e", "infantry", "p2", { x: 1, y: 0 }), // in forest
    ]);
    expect(projectStateForPlayer(s, "p1", gd).units.map((u) => u.id)).toEqual([
      "t",
    ]);
  });

  it("reveals a Forest-hidden unit when an adjacent unit detects it", () => {
    const gd = makeGameData(grid);
    const s = state([
      unit("i", "infantry", "p1", { x: 0, y: 0 }), // detects adjacent forest
      unit("e", "infantry", "p2", { x: 1, y: 0 }),
    ]);
    expect(
      projectStateForPlayer(s, "p1", gd)
        .units.map((u) => u.id)
        .sort(),
    ).toEqual(["e", "i"]);
  });

  it("never hides an air unit in Forest", () => {
    const gd = makeGameData(grid);
    const s = state([
      unit("t", "tank", "p1", { x: 0, y: 0 }),
      unit("e", "fighter", "p2", { x: 1, y: 0 }), // air over forest
    ]);
    expect(
      projectStateForPlayer(s, "p1", gd).units.some((u) => u.id === "e"),
    ).toBe(true);
  });

  it("hides a naval unit in Reef without a detector", () => {
    const reefGrid = [["plain", "reef", "plain", "plain"]];
    const gd = makeGameData(reefGrid);
    const s = state([
      unit("t", "tank", "p1", { x: 0, y: 0 }),
      unit("e", "submarine", "p2", { x: 1, y: 0 }), // naval in reef, surfaced
    ]);
    expect(
      projectStateForPlayer(s, "p1", gd).units.some((u) => u.id === "e"),
    ).toBe(false);
  });
});

describe("submarine detection (§19.4)", () => {
  const grid = [["plain", "plain", "plain", "plain", "plain"]];

  it("hides a submerged submarine from a non-detector that sees the tile", () => {
    const gd = makeGameData(grid);
    const s = state([
      unit("t", "tank", "p1", { x: 3, y: 0 }), // sees (1,0), not adjacent
      unit(
        "sub",
        "submarine",
        "p2",
        { x: 1, y: 0 },
        { specialState: "submerged" },
      ),
    ]);
    expect(
      projectStateForPlayer(s, "p1", gd).units.some((u) => u.id === "sub"),
    ).toBe(false);
  });

  it("reveals a submerged submarine to an adjacent Cruiser", () => {
    const gd = makeGameData(grid);
    const s = state([
      unit("cr", "cruiser", "p1", { x: 0, y: 0 }),
      unit(
        "sub",
        "submarine",
        "p2",
        { x: 1, y: 0 },
        { specialState: "submerged" },
      ),
    ]);
    expect(
      projectStateForPlayer(s, "p1", gd).units.some((u) => u.id === "sub"),
    ).toBe(true);
  });
});

describe("projection (§18.7, §16.5)", () => {
  const grid = [["plain", "plain", "plain", "plain", "plain", "plain"]];

  it("omits enemy units on shrouded tiles and strips enemy cargo identity", () => {
    const gd = makeGameData(grid);
    const s = state([
      unit("t", "tank", "p1", { x: 0, y: 0 }), // vision 3
      unit("near", "tank", "p2", { x: 2, y: 0 }, { cargoUnitIds: ["c"] }),
      unit("far", "tank", "p2", { x: 5, y: 0 }), // shrouded
      unit("c", "infantry", "p2", null), // enemy cargo
    ]);
    const view = projectStateForPlayer(s, "p1", gd);
    expect(view.units.map((u) => u.id).sort()).toEqual(["near", "t"]);
    expect(view.units.find((u) => u.id === "near")?.cargoUnitIds).toEqual([]);
  });
});

describe("hidden-collision movement (§18.5)", () => {
  it("stops before an unseen enemy and charges the committed fuel", () => {
    const gd = makeGameData([["plain", "plain", "plain", "plain", "plain"]]);
    const s = state([
      unit("i", "infantry", "p1", { x: 0, y: 0 }), // vision 2 → cannot see (3,0)
      unit("e", "tank", "p2", { x: 3, y: 0 }),
    ]);
    const move: MoveAndWaitAction = {
      type: "move_and_wait",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "i",
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 2, y: 0 },
        { x: 3, y: 0 },
      ],
    };
    const { nextState, events } = applyAction(s, move, gd, NO_RANDOM);

    const mover = nextState.units.find((u) => u.id === "i");
    expect(mover?.position).toEqual({ x: 2, y: 0 }); // stopped before the enemy
    expect(mover?.fuel).toBe(97); // two committed tiles
    expect(events).toContainEqual({
      type: "unit_blocked_by_fog",
      unitId: "i",
      stoppedAt: { x: 2, y: 0 },
    });
  });
});
