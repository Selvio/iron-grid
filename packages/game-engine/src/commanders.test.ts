import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import type { ActivatePowerAction } from "./actions";
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
 * M3-T8: the declarative commander mechanism. The resolver is inert with the
 * real (disabled) data, so these tests prove the wiring with SYNTHETIC
 * placeholder commanders — never real §33.1 values.
 *
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T8)
 */

const cell = (weaponId: string, base: number) => ({
  weapon_id: weaponId,
  base_damage: base,
});

/**
 * A placeholder commander with a passive modifier and an optional power cost.
 * `passive.status` is "approved" because ADR-0006 makes that the gate the
 * resolver checks; `passiveStatus` overrides it to prove the gate holds.
 */
function commander(
  id: string,
  modifiers: unknown[],
  powerCost: number | null = null,
  passiveStatus: string = "approved",
) {
  return {
    id,
    faction_id: "blue",
    status: "approved",
    passive: { status: passiveStatus, modifiers },
    meter: { max_points: 100, power_cost: powerCost },
    power: { id: `${id}_power`, cost: powerCost },
    implementation: { enabled_in_mvp: true },
  };
}

const addMod = (target: string, value: number, scope = "all_units") => ({
  id: `m_${target}`,
  target,
  operation: "add",
  value,
  scope: { type: scope, values: [] },
  priority: 0,
});

function makeGameData(commanders: Record<string, unknown>): GameData {
  return {
    units: {
      tank: {
        category: "ground",
        movement: { type: "treads", points: 6 },
        vision: { base_range: 3, mountain_bonus_eligible: false },
        logistics: {
          primary_ammo_per_attack: 1,
          daily_fuel: { default: 0 },
        },
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
              weapon_values: { primary: cell("cannon", 55) },
            },
          },
        },
      },
    },
    properties: {
      city: {
        economy: { income_per_turn: 1000 },
        repair: { categories: ["ground"] },
      },
    },
    terrain: { plain: { defense_stars: 0, movement_costs: { treads: 1 } } },
    commanders: { factions: {}, commanders },
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

function player(id: string, commanderId: string, powerMeter = 0): PlayerState {
  return {
    playerId: id,
    userId: `u_${id}`,
    factionId: "blue",
    commanderId,
    funds: 0,
    powerMeter,
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
  players: readonly PlayerState[],
  units: readonly UnitState[] = [],
  properties: readonly PropertyState[] = [],
): MatchState {
  return { match: match(), players, units, properties, terrainObjects: [] };
}

const NO_RANDOM = { nextInt: () => 0 };

describe("declarative modifier resolver", () => {
  it("adds a commander attack modifier to combat damage", () => {
    // co_a grants +10 attack; a tank normally deals 55 at full HP.
    const gd = makeGameData({
      co_a: commander("co_a", [addMod("attack", 10)]),
    });
    const s = state(
      [player("p1", "co_a"), player("p2", "co_none")],
      [unit("a", "p1", { x: 0, y: 0 }), unit("d", "p2", { x: 1, y: 0 })],
    );
    const { events } = applyAction(
      s,
      {
        type: "attack",
        matchId: "m1",
        playerId: "p1",
        expectedStateVersion: 1,
        idempotencyKey: "k",
        unitId: "a",
        targetUnitId: "d",
      },
      gd,
      NO_RANDOM,
    );
    // attackValue 110 → 55 * 110/100 = 60.5 → 60, up from the unmodified 55.
    expect(events.find((e) => e.type === "unit_attacked")).toMatchObject({
      damage: 60,
    });
  });

  it("adds a commander income modifier at start of turn", () => {
    const gd = makeGameData({
      co_b: commander("co_b", [addMod("property_income", 500)]),
    });
    const s = state(
      [player("p1", "co_b"), player("p2", "co_none")],
      [],
      [
        {
          id: "c",
          typeId: "city",
          position: { x: 0, y: 0 },
          ownerPlayerId: "p1",
          capturePointsRemaining: 20,
          capturingUnitId: null,
        },
      ],
    );
    const { events } = resolveStartOfTurn(s, gd);
    // 1000 base + 500 commander modifier.
    expect(events.find((e) => e.type === "income_granted")).toMatchObject({
      amount: 1500,
    });
  });

  it("is inert (no change) when the player has no resolved commander", () => {
    const gd = makeGameData({});
    const s = state(
      [player("p1", "co_none"), player("p2", "co_none")],
      [unit("a", "p1", { x: 0, y: 0 }), unit("d", "p2", { x: 1, y: 0 })],
    );
    const { events } = applyAction(
      s,
      {
        type: "attack",
        matchId: "m1",
        playerId: "p1",
        expectedStateVersion: 1,
        idempotencyKey: "k",
        unitId: "a",
        targetUnitId: "d",
      },
      gd,
      NO_RANDOM,
    );
    expect(events.find((e) => e.type === "unit_attacked")).toMatchObject({
      damage: 55, // unmodified
    });
  });
});

describe("activate_power skeleton (§22.5)", () => {
  function activate(): ActivatePowerAction {
    return {
      type: "activate_power",
      matchId: "m1",
      playerId: "p1",
      expectedStateVersion: 1,
      idempotencyKey: "k",
    };
  }

  it("spends the meter and emits power_activated when charged", () => {
    const gd = makeGameData({ co_c: commander("co_c", [], 30) });
    const s = state([player("p1", "co_c", 50), player("p2", "co_none")]);
    const { nextState, events } = applyAction(s, activate(), gd, NO_RANDOM);
    expect(nextState.players.find((p) => p.playerId === "p1")?.powerMeter).toBe(
      20,
    );
    expect(events).toEqual([
      {
        type: "power_activated",
        playerId: "p1",
        commanderId: "co_c",
        powerId: "co_c_power",
      },
    ]);
  });

  it("rejects activation without enough meter", () => {
    const gd = makeGameData({ co_c: commander("co_c", [], 30) });
    const s = state([player("p1", "co_c", 10), player("p2", "co_none")]);
    const result = validateAction(s, activate(), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("power_not_ready");
    }
  });

  it("rejects activation for a blocked commander with no resolved power cost", () => {
    const gd = makeGameData({ co_d: commander("co_d", [], null) });
    const s = state([player("p1", "co_d", 99), player("p2", "co_none")]);
    const result = validateAction(s, activate(), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("power_not_ready");
    }
  });
});
