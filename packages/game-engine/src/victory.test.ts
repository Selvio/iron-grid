import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import type { AttackAction, CaptureAction } from "./actions";
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
import { evaluateVictory } from "./victory";

/**
 * M3-T7: victory/defeat — HQ capture and army elimination on the resolved
 * end-of-action state (§23, §13.5, elimination timing §23.2).
 *
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T7)
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
        movement: { type: "foot", points: 3, can_move_and_capture: true },
        capabilities: { can_capture: true },
        combat: { type: "direct", min_range: 1, max_range: 1 },
      },
      tank: {
        category: "ground",
        movement: { type: "treads", points: 6, can_move_and_capture: false },
        capabilities: { can_capture: false },
        logistics: { primary_ammo_per_attack: 1 },
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
            tank: {
              defender_id: "tank",
              weapon_values: { primary: cell("cannon", 90) },
            },
          },
        },
      },
    },
    properties: {
      headquarters: {
        capturable: true,
        max_capture_points: 20,
        defeat: { triggers_defeat_on_capture: true },
      },
      city: {
        capturable: true,
        max_capture_points: 20,
        defeat: { triggers_defeat_on_capture: false },
        // A city cannot build — only a base/airport/port carries a category.
        production: { category: "none" },
      },
      base: {
        capturable: true,
        max_capture_points: 20,
        defeat: { triggers_defeat_on_capture: false },
        production: { category: "ground" },
      },
    },
    terrain: {
      plain: { defense_stars: 0, movement_costs: { foot: 1, treads: 1 } },
    },
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

function property(
  id: string,
  typeId: string,
  ownerPlayerId: string | null,
  position: Coordinate,
  patch: Partial<PropertyState> = {},
): PropertyState {
  return {
    id,
    typeId,
    position,
    ownerPlayerId,
    capturePointsRemaining: 20,
    capturingUnitId: null,
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

function match(activePlayerId: string): MatchMeta {
  return {
    id: "m1",
    status: "active",
    dataVersion: "1.0.0",
    mapId: "m",
    stateVersion: 1,
    currentDay: 1,
    activePlayerId,
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

function state(
  units: readonly UnitState[],
  properties: readonly PropertyState[],
  activePlayerId = "p1",
): MatchState {
  return {
    match: match(activePlayerId),
    players: [player("p1"), player("p2")],
    units,
    properties,
    terrainObjects: [],
  };
}

const NO_RANDOM: RandomSource = { nextInt: () => 0 };

describe("HQ capture victory (§13.5, §23.1)", () => {
  it("completes the match when a player captures the enemy HQ", () => {
    const gd = makeGameData();
    const s = state(
      [
        // p1 infantry finishing the capture of p2's HQ.
        unit("i", "infantry", "p1", { x: 0, y: 0 }, { trueHp: 100 }),
        unit("t2", "tank", "p2", { x: 2, y: 0 }), // p2 still has an army
      ],
      [
        property("hq1", "headquarters", "p1", { x: 1, y: 0 }),
        property(
          "hq2",
          "headquarters",
          "p2",
          { x: 0, y: 0 },
          {
            capturePointsRemaining: 10,
            capturingUnitId: "i",
          },
        ),
      ],
    );
    const capture: CaptureAction = {
      type: "capture",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "i",
    };
    const { nextState, events } = applyAction(s, capture, gd, NO_RANDOM);

    expect(nextState.match.status).toBe("completed");
    expect(nextState.match.winnerPlayerId).toBe("p1");
    expect(nextState.match.completionReason).toBe("headquarters_captured");
    expect(events).toContainEqual({
      type: "match_completed",
      winnerPlayerId: "p1",
      reason: "headquarters_captured",
    });
  });
});

describe("army elimination (§23.2 timing)", () => {
  it("completes when the last enemy unit is destroyed in the resolved action", () => {
    const gd = makeGameData();
    const s = state(
      [
        unit("a", "tank", "p1", { x: 0, y: 0 }),
        unit("d", "tank", "p2", { x: 1, y: 0 }, { trueHp: 40 }), // p2's only unit
      ],
      [
        property("hq1", "headquarters", "p1", { x: 2, y: 0 }),
        property("hq2", "headquarters", "p2", { x: 2, y: 0 }),
      ],
    );
    const attack: AttackAction = {
      type: "attack",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
      unitId: "a",
      targetUnitId: "d",
    };
    const { nextState, events } = applyAction(s, attack, gd, NO_RANDOM);

    expect(nextState.units.some((u) => u.id === "d")).toBe(false);
    expect(nextState.match.status).toBe("completed");
    expect(nextState.match.winnerPlayerId).toBe("p1");
    expect(nextState.match.completionReason).toBe("army_eliminated");
    expect(events.at(-1)).toEqual({
      type: "match_completed",
      winnerPlayerId: "p1",
      reason: "army_eliminated",
    });
  });
});

describe("evaluateVictory (pure)", () => {
  it("does not complete while both players keep an HQ and an army", () => {
    const gd = makeGameData();
    const s = state(
      [
        unit("a", "tank", "p1", { x: 0, y: 0 }),
        unit("b", "tank", "p2", { x: 2, y: 0 }),
      ],
      [
        property("hq1", "headquarters", "p1", { x: 0, y: 0 }),
        property("hq2", "headquarters", "p2", { x: 2, y: 0 }),
      ],
    );
    expect(evaluateVictory(s, gd)).toEqual({ completed: false });
  });

  it("does not complete with fewer than two participants", () => {
    const gd = makeGameData();
    const s = state([unit("a", "tank", "p1", { x: 0, y: 0 })], []);
    expect(evaluateVictory(s, gd)).toEqual({ completed: false });
  });

  it("does not auto-draw when both participants are defeated (§23.5)", () => {
    const gd = makeGameData();
    // Both own a non-HQ property but neither has any unit → mutual loss.
    const s = state(
      [],
      [
        property("c1", "city", "p1", { x: 0, y: 0 }),
        property("c2", "city", "p2", { x: 2, y: 0 }),
      ],
    );
    expect(evaluateVictory(s, gd)).toEqual({ completed: false });
  });

  it("reports no result once the match is already completed", () => {
    const gd = makeGameData();
    const s = state([unit("a", "tank", "p1", { x: 0, y: 0 })], []);
    const completed = {
      ...s,
      match: { ...s.match, status: "completed" as const },
    };
    expect(evaluateVictory(completed, gd)).toEqual({ completed: false });
  });
});

/**
 * ADR-0007 — elimination requires losing the *ability to field* an army, which
 * resolves `rules.yaml` → `army-elimination-edge-case`.
 */
describe("army elimination with production available (ADR-0007)", () => {
  it("does not hand the match to whoever builds first from a zero-unit start", () => {
    const gd = makeGameData();
    // `rainy-haven` / `eon-springs` ship `starting_units: []`, so this is the
    // real opening position: both sides own an HQ and a base, nobody has a unit.
    const opening = state(
      [],
      [
        property("hq1", "headquarters", "p1", { x: 0, y: 0 }),
        property("b1", "base", "p1", { x: 0, y: 0 }),
        property("hq2", "headquarters", "p2", { x: 2, y: 0 }),
        property("b2", "base", "p2", { x: 2, y: 0 }),
      ],
    );
    expect(evaluateVictory(opening, gd)).toEqual({ completed: false });

    // p1 produces the first unit of the match. Before ADR-0007 this ended it.
    const afterFirstBuild = {
      ...opening,
      units: [unit("i1", "infantry", "p1", { x: 0, y: 0 })],
    };
    expect(evaluateVictory(afterFirstBuild, gd)).toEqual({ completed: false });
  });

  it("does not eliminate a player who lost their army but still holds a base", () => {
    const gd = makeGameData();
    const s = state(
      [unit("a", "tank", "p1", { x: 0, y: 0 })],
      [
        property("hq1", "headquarters", "p1", { x: 0, y: 0 }),
        property("hq2", "headquarters", "p2", { x: 2, y: 0 }),
        property("b2", "base", "p2", { x: 2, y: 0 }),
      ],
    );
    expect(evaluateVictory(s, gd)).toEqual({ completed: false });
  });

  it("still eliminates a player with no units and nothing to build with", () => {
    const gd = makeGameData();
    // p2 holds only a city: income, but no way back onto the board.
    const s = state(
      [unit("a", "tank", "p1", { x: 0, y: 0 })],
      [
        property("hq1", "headquarters", "p1", { x: 0, y: 0 }),
        property("b1", "base", "p1", { x: 0, y: 0 }),
        property("hq2", "headquarters", "p2", { x: 2, y: 0 }),
        property("c2", "city", "p2", { x: 2, y: 0 }),
      ],
    );
    expect(evaluateVictory(s, gd)).toEqual({
      completed: true,
      winnerPlayerId: "p1",
      reason: "army_eliminated",
    });
  });

  it("still ends on a captured headquarters, base or no base", () => {
    const gd = makeGameData();
    // p2 keeps units and a base but has lost the HQ — §13.5 is untouched.
    const s = state(
      [
        unit("a", "tank", "p1", { x: 0, y: 0 }),
        unit("b", "tank", "p2", { x: 2, y: 0 }),
      ],
      [
        property("hq1", "headquarters", "p1", { x: 0, y: 0 }),
        property("hq2", "headquarters", "p1", { x: 2, y: 0 }), // captured
        property("b2", "base", "p2", { x: 2, y: 0 }),
      ],
    );
    expect(evaluateVictory(s, gd)).toEqual({
      completed: true,
      winnerPlayerId: "p1",
      reason: "headquarters_captured",
    });
  });
});
