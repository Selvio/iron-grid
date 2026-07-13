import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import { applyAction } from "./apply";
import type { ProduceAction } from "./actions";
import { calculateLegalActions } from "./legal-actions";
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
 * M3-T3: production — an owned production property builds an enabled unit for its
 * cost, placed already acted and unable to act until next turn (§6.4).
 *
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T3)
 */

function makeGameData(): GameData {
  const u = (patch: Record<string, unknown>) => ({
    category: "ground",
    enabled_in_mvp: true,
    max_true_hp: 100,
    logistics: { max_fuel: 99, max_ammo: null },
    special_states: [],
    movement: { type: "foot", points: 3 },
    ...patch,
  });
  return {
    units: {
      infantry: u({ cost: 1000 }),
      tank: u({
        cost: 7000,
        logistics: { max_fuel: 70, max_ammo: 9 },
        movement: { type: "treads", points: 6 },
      }),
      disabled_unit: u({ cost: 1000, enabled_in_mvp: false }),
      submarine: u({
        cost: 20000,
        category: "naval",
        logistics: { max_fuel: 60, max_ammo: 6 },
        special_states: ["surfaced", "submerged"],
        movement: { type: "ship", points: 6 },
      }),
    },
    properties: {
      base: {
        production: {
          category: "ground",
          allowed_unit_ids: ["infantry", "tank", "disabled_unit"],
        },
      },
      city: { production: { category: "none", allowed_unit_ids: [] } },
      port: {
        production: { category: "naval", allowed_unit_ids: ["submarine"] },
      },
    },
    terrain: { plain: { movement_costs: { foot: 1, treads: 1, ship: 1 } } },
    maps: {
      m: {
        dimensions: { width: 2, height: 1 },
        logical_terrain: [["plain", "plain"]],
      },
    },
  } as unknown as GameData;
}

function unit(id: string, position: Coordinate): UnitState {
  return {
    id,
    typeId: "infantry",
    ownerPlayerId: "p1",
    position,
    trueHp: 100,
    fuel: 99,
    ammo: 0,
    hasActed: false,
    captureTargetPropertyId: null,
    cargoUnitIds: [],
    specialState: null,
    createdTurn: 0,
  };
}

function property(
  id: string,
  typeId: string,
  ownerPlayerId: string | null,
): PropertyState {
  return {
    id,
    typeId,
    position: { x: 0, y: 0 },
    ownerPlayerId,
    capturePointsRemaining: 20,
    capturingUnitId: null,
  };
}

function player(id: string, funds: number): PlayerState {
  return {
    playerId: id,
    userId: `u_${id}`,
    factionId: "blue",
    commanderId: "c",
    funds,
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
    currentDay: 3,
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

function state(
  properties: readonly PropertyState[],
  units: readonly UnitState[] = [],
  funds = 5000,
): MatchState {
  return {
    match: match(),
    players: [player("p1", funds), player("p2", 5000)],
    units,
    properties,
    terrainObjects: [],
  };
}

const NO_RANDOM = { nextInt: () => 0 };

function produce(
  unitTypeId: string,
  patch: Partial<ProduceAction> = {},
): ProduceAction {
  return {
    type: "produce",
    matchId: "m1",
    playerId: "p1",
    expectedStateVersion: 1,
    idempotencyKey: "k",
    propertyId: "b",
    unitTypeId,
    newUnitId: "n1",
    ...patch,
  };
}

describe("production", () => {
  it("deducts cost and places a full-state, already-acted unit", () => {
    const gd = makeGameData();
    const s = state([property("b", "base", "p1")], [], 10000);
    const { nextState } = applyAction(s, produce("tank"), gd, NO_RANDOM);

    const built = nextState.units.find((u) => u.id === "n1");
    expect(built).toMatchObject({
      typeId: "tank",
      ownerPlayerId: "p1",
      position: { x: 0, y: 0 },
      trueHp: 100,
      fuel: 70,
      ammo: 9,
      hasActed: true,
      createdTurn: 3,
    });
    expect(nextState.players.find((p) => p.playerId === "p1")?.funds).toBe(
      3000,
    );
  });

  it("credits the exact cost and reports funds after in the event", () => {
    const gd = makeGameData();
    const s = state([property("b", "base", "p1")], [], 5000);
    const { nextState, events } = applyAction(
      s,
      produce("infantry"),
      gd,
      NO_RANDOM,
    );
    expect(nextState.players.find((p) => p.playerId === "p1")?.funds).toBe(
      4000,
    );
    expect(events).toEqual([
      {
        type: "unit_produced",
        unitId: "n1",
        unitTypeId: "infantry",
        propertyId: "b",
        ownerPlayerId: "p1",
        fundsAfter: 4000,
      },
    ]);
  });

  it("gives a produced diver its initial surfaced state", () => {
    const gd = makeGameData();
    const s = state([property("b", "port", "p1")], [], 30000);
    const { nextState } = applyAction(s, produce("submarine"), gd, NO_RANDOM);
    expect(nextState.units.find((u) => u.id === "n1")?.specialState).toBe(
      "surfaced",
    );
  });

  it("the produced unit has no legal actions this turn", () => {
    const gd = makeGameData();
    const s = state([property("b", "base", "p1")]);
    const { nextState } = applyAction(s, produce("infantry"), gd, NO_RANDOM);
    const legal = calculateLegalActions(nextState, "p1", gd);
    expect(legal.some((a) => a.unitId === "n1")).toBe(false);
  });

  it("rejects producing on an occupied property tile", () => {
    const gd = makeGameData();
    const s = state(
      [property("b", "base", "p1")],
      [unit("blocker", { x: 0, y: 0 })],
    );
    const result = validateAction(s, produce("infantry"), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_production");
    }
  });

  it("rejects producing on a property the player does not own", () => {
    const gd = makeGameData();
    const s = state([property("b", "base", "p2")]);
    const result = validateAction(s, produce("infantry"), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_production");
    }
  });

  it("rejects a unit the property's category does not allow", () => {
    const gd = makeGameData();
    const s = state([property("b", "port", "p1")], [], 30000);
    const result = validateAction(s, produce("infantry"), gd); // port is naval-only
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_production");
    }
  });

  it("rejects a non-production property", () => {
    const gd = makeGameData();
    const s = state([property("b", "city", "p1")]);
    const result = validateAction(s, produce("infantry"), gd);
    expect(result.valid).toBe(false);
  });

  it("rejects a disabled unit", () => {
    const gd = makeGameData();
    const s = state([property("b", "base", "p1")]);
    const result = validateAction(s, produce("disabled_unit"), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_production");
    }
  });

  it("rejects production the player cannot afford", () => {
    const gd = makeGameData();
    const s = state([property("b", "base", "p1")], [], 500);
    const result = validateAction(s, produce("infantry"), gd); // cost 1000
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("insufficient_funds");
    }
  });
});
