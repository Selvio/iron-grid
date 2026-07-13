import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import { applyAction } from "./apply";
import type { AttackAction } from "./actions";
import { calculateCombatPreview } from "./combat";
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
 * M3-T1: the `attack` transaction — direct/indirect, counterattack, destruction,
 * ammo, terrain defense and deterministic persisted luck (§12, §35 #6–#13).
 *
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T1)
 */

/** A RandomSource that returns a fixed queue of luck values (attacker, counter). */
function luck(...values: number[]): RandomSource {
  let i = 0;
  return { nextInt: () => values[i++] ?? 0 };
}

const cell = (weaponId: string, base: number) => ({
  weapon_id: weaponId,
  base_damage: base,
});

function makeGameData(grid: readonly string[][]): GameData {
  return {
    units: {
      tank: {
        category: "ground",
        movement: { type: "treads", points: 6, can_move_and_attack: true },
        logistics: { primary_ammo_per_attack: 1 },
        combat: { type: "direct", min_range: 1, max_range: 1 },
      },
      artillery: {
        category: "ground",
        movement: { type: "treads", points: 5, can_move_and_attack: false },
        logistics: { primary_ammo_per_attack: 1 },
        combat: { type: "indirect", min_range: 2, max_range: 3 },
      },
      infantry: {
        category: "ground",
        movement: { type: "foot", points: 3, can_move_and_attack: true },
        logistics: { primary_ammo_per_attack: 0 },
        combat: { type: "direct", min_range: 1, max_range: 1 },
      },
      fighter: {
        category: "air",
        movement: { type: "air", points: 9, can_move_and_attack: true },
        logistics: { primary_ammo_per_attack: 1 },
        combat: { type: "direct", min_range: 1, max_range: 1 },
      },
    },
    weapons: {},
    damageChart: {
      attackers: {
        tank: {
          unit_id: "tank",
          weapons: { primary: "light_tank_cannon", secondary: "machine_gun" },
          matchups: {
            tank: {
              defender_id: "tank",
              weapon_values: {
                primary: cell("light_tank_cannon", 55),
                secondary: cell("machine_gun", 6),
              },
            },
            infantry: {
              defender_id: "infantry",
              weapon_values: {
                primary: cell("light_tank_cannon", 25),
                secondary: cell("machine_gun", 75),
              },
            },
          },
        },
        artillery: {
          unit_id: "artillery",
          weapons: { primary: "artillery_cannon" },
          matchups: {
            tank: {
              defender_id: "tank",
              weapon_values: { primary: cell("artillery_cannon", 70) },
            },
          },
        },
        infantry: {
          unit_id: "infantry",
          weapons: { secondary: "machine_gun" },
          // Deliberately no matchup vs tank → cannot damage it (§35 #9).
          matchups: {},
        },
        fighter: {
          unit_id: "fighter",
          weapons: { primary: "air_to_air_missiles" },
          matchups: {
            fighter: {
              defender_id: "fighter",
              weapon_values: { primary: cell("air_to_air_missiles", 55) },
            },
          },
        },
      },
    },
    terrain: {
      plain: {
        defense_stars: 0,
        movement_costs: { foot: 1, treads: 1, air: 1 },
      },
      forest: {
        defense_stars: 2,
        movement_costs: { foot: 1, treads: 2, air: 1 },
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

const ROW = [["plain", "plain", "plain", "plain", "forest", "plain"]];

function attack(
  unitId: string,
  targetUnitId: string,
  patch: Partial<AttackAction> = {},
): AttackAction {
  return {
    type: "attack",
    matchId: "m1",
    playerId: "p1",
    expectedStateVersion: 1,
    idempotencyKey: "k",
    unitId,
    targetUnitId,
    ...patch,
  };
}

describe("direct combat and counterattack", () => {
  it("#7: a surviving direct defender counterattacks with its own luck roll", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 0, y: 0 }),
      unit("d", "tank", "p2", { x: 1, y: 0 }),
    ]);
    const { nextState, events } = applyAction(
      s,
      attack("a", "d"),
      gd,
      luck(0, 0),
    );

    // Attacker deals 55 (defender 100 → 45); defender counters for 27 (attacker → 73).
    const types = events.map((e) => e.type);
    expect(types).toEqual(["unit_attacked", "unit_counterattacked"]);
    expect(nextState.units.find((u) => u.id === "d")?.trueHp).toBe(45);
    expect(nextState.units.find((u) => u.id === "a")?.trueHp).toBe(73);
    // Both spent one primary ammo; the attacker's activation ended.
    expect(nextState.units.find((u) => u.id === "a")?.ammo).toBe(8);
    expect(nextState.units.find((u) => u.id === "d")?.ammo).toBe(8);
    expect(nextState.units.find((u) => u.id === "a")?.hasActed).toBe(true);
  });

  it("persists the drawn luck in the event and advances the sequence index", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 0, y: 0 }),
      unit("d", "tank", "p2", { x: 1, y: 0 }),
    ]);
    const { nextState, events } = applyAction(
      s,
      attack("a", "d"),
      gd,
      luck(3, 5),
    );
    const attacked = events.find((e) => e.type === "unit_attacked");
    expect(attacked).toMatchObject({
      luck: { goodLuck: 3, badLuck: 0 },
      damage: 58,
    });
    // Two draws committed (attack + counter).
    expect(nextState.match.randomSequenceIndex).toBe(2);
  });

  it("#12: a primary attack decrements ammo; a moved attacker spends fuel", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 0, y: 0 }, { ammo: 9, fuel: 50 }),
      unit("d", "tank", "p2", { x: 2, y: 0 }),
    ]);
    // Move to (1,0) then attack (2,0).
    const action = attack("a", "d", {
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    const { nextState, events } = applyAction(s, action, gd, luck(0, 0));
    expect(events.map((e) => e.type)).toEqual([
      "unit_moved",
      "unit_attacked",
      "unit_counterattacked",
    ]);
    const a = nextState.units.find((u) => u.id === "a");
    expect(a?.position).toEqual({ x: 1, y: 0 });
    expect(a?.fuel).toBe(49); // one tile
    expect(a?.ammo).toBe(8); // one primary shot
  });

  it("#13: the secondary weapon is selected when the primary has no ammo", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 0, y: 0 }, { ammo: 0 }),
      unit("d", "tank", "p2", { x: 1, y: 0 }),
    ]);
    const { events } = applyAction(s, attack("a", "d"), gd, luck(0, 0));
    const attacked = events.find((e) => e.type === "unit_attacked");
    // Machine gun (secondary, base 6) instead of the cannon.
    expect(attacked).toMatchObject({ weaponId: "machine_gun", damage: 6 });
  });
});

describe("terrain defense", () => {
  it("#10: terrain reduces damage to a ground defender", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 3, y: 0 }),
      unit("d", "tank", "p2", { x: 4, y: 0 }), // forest tile
    ]);
    const { events } = applyAction(s, attack("a", "d"), gd, luck(0, 0));
    // Forest 2 stars at full HP: 55 * 0.8 = 44, down from 55 on plain.
    expect(events.find((e) => e.type === "unit_attacked")).toMatchObject({
      damage: 44,
    });
  });

  it("#11: an air defender receives no terrain defense", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "fighter", "p1", { x: 3, y: 0 }),
      unit("d", "fighter", "p2", { x: 4, y: 0 }), // forest tile, but air ignores it
    ]);
    const { events } = applyAction(s, attack("a", "d"), gd, luck(0));
    expect(events.find((e) => e.type === "unit_attacked")).toMatchObject({
      damage: 55, // full damage despite the forest
    });
  });
});

describe("indirect combat and counterattack eligibility", () => {
  it("#6: an indirect unit cannot move and fire", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("art", "artillery", "p1", { x: 0, y: 0 }),
      unit("d", "tank", "p2", { x: 2, y: 0 }),
    ]);
    const action = attack("art", "d", {
      path: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    });
    const result = validateAction(s, action, gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain(
        "cannot_move_and_attack",
      );
    }
  });

  it("#8: an indirect attack draws no counterattack", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("art", "artillery", "p1", { x: 0, y: 0 }),
      unit("d", "tank", "p2", { x: 2, y: 0 }), // distance 2, in range 2-3
    ]);
    const { events } = applyAction(s, attack("art", "d"), gd, luck(0));
    expect(events.map((e) => e.type)).toEqual(["unit_attacked"]);
  });

  it("#9: a defender that cannot damage the attacker does not counterattack", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 0, y: 0 }),
      unit("d", "infantry", "p2", { x: 1, y: 0 }), // survives, but has no cell vs tank
    ]);
    const { nextState, events } = applyAction(s, attack("a", "d"), gd, luck(0));
    expect(events.map((e) => e.type)).toEqual(["unit_attacked"]);
    expect(nextState.units.find((u) => u.id === "d")?.trueHp).toBe(25); // 100 - 75
  });
});

describe("destruction", () => {
  it("removes a defender at zero HP and emits unit_destroyed, with no counter", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 0, y: 0 }),
      unit("d", "tank", "p2", { x: 1, y: 0 }, { trueHp: 40 }), // 55 dmg kills it
    ]);
    const { nextState, events } = applyAction(s, attack("a", "d"), gd, luck(0));
    expect(events.map((e) => e.type)).toEqual([
      "unit_attacked",
      "unit_destroyed",
    ]);
    expect(nextState.units.some((u) => u.id === "d")).toBe(false);
    expect(events.find((e) => e.type === "unit_destroyed")).toMatchObject({
      unitId: "d",
      reason: "combat",
    });
  });
});

describe("validation", () => {
  it("rejects attacking a friendly unit", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 0, y: 0 }),
      unit("f", "tank", "p1", { x: 1, y: 0 }),
    ]);
    const result = validateAction(s, attack("a", "f"), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_target");
    }
  });

  it("rejects an out-of-range target", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 0, y: 0 }),
      unit("d", "tank", "p2", { x: 3, y: 0 }), // distance 3, tank range 1
    ]);
    const result = validateAction(s, attack("a", "d"), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("out_of_range");
    }
  });
});

describe("calculateCombatPreview", () => {
  it("forecasts min/max attacker damage and the counter range", () => {
    const gd = makeGameData(ROW);
    const s = state([
      unit("a", "tank", "p1", { x: 0, y: 0 }),
      unit("d", "tank", "p2", { x: 1, y: 0 }),
    ]);
    const preview = calculateCombatPreview(s, attack("a", "d"), gd);
    expect(preview.minDamage).toBe(55); // luck 0
    expect(preview.maxDamage).toBe(64); // luck 9
    expect(preview.counter).toBeDefined();
  });
});
