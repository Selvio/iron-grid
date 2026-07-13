import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import { applyAction } from "./apply";
import type { CaptureAction, MoveAndWaitAction } from "./actions";
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
 * M3-T2: capture — subtract displayed HP from the property's points, persist
 * across owner turns, reset on interruption, flip ownership at zero (§13,
 * §35 #1–#3).
 *
 * @see docs/04-development/milestones/m3-combat-systems-fog.md (M3-T2)
 */

function makeGameData(): GameData {
  const plain = { foot: 1, mech: 1, treads: 1, tires: 1, air: 1 };
  return {
    units: {
      infantry: {
        category: "ground",
        movement: { type: "foot", points: 3, can_move_and_capture: true },
        capabilities: { can_capture: true },
      },
      tank: {
        category: "ground",
        movement: { type: "treads", points: 6, can_move_and_capture: false },
        capabilities: { can_capture: false },
      },
    },
    properties: {
      city: {
        capturable: true,
        max_capture_points: 20,
        defeat: { triggers_defeat_on_capture: false },
      },
      headquarters: {
        capturable: true,
        max_capture_points: 20,
        defeat: { triggers_defeat_on_capture: true },
      },
    },
    terrain: { plain: { movement_costs: plain } },
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

function state(
  units: readonly UnitState[],
  properties: readonly PropertyState[],
): MatchState {
  return {
    match: match(),
    players: [player("p1"), player("p2")],
    units,
    properties,
    terrainObjects: [],
  };
}

/** Clear every unit's acted flag, standing in for a start-of-turn reset. */
function readyAgain(s: MatchState): MatchState {
  return { ...s, units: s.units.map((u) => ({ ...u, hasActed: false })) };
}

const NO_RANDOM = { nextInt: () => 0 };

function capture(unitId: string, path?: Coordinate[]): CaptureAction {
  return {
    type: "capture",
    matchId: "m1",
    playerId: "p1",
    expectedStateVersion: 1,
    idempotencyKey: "k",
    unitId,
    ...(path ? { path } : {}),
  };
}

function propertyIn(s: MatchState, id: string): PropertyState | undefined {
  return s.properties.find((p) => p.id === id);
}

describe("capture progress and completion (§13.3, §13.5)", () => {
  it("#1: a full-HP Infantry captures a neutral City over two owner turns", () => {
    const gd = makeGameData();
    const s = state(
      [unit("i", "infantry", "p1", { x: 0, y: 0 })],
      [property("c", "city", null, { x: 0, y: 0 })],
    );

    // Turn 1: 20 - 10 displayed HP = 10 remaining.
    const t1 = applyAction(s, capture("i"), gd, NO_RANDOM);
    expect(t1.events.map((e) => e.type)).toEqual([
      "capture_started",
      "capture_progressed",
    ]);
    expect(propertyIn(t1.nextState, "c")?.capturePointsRemaining).toBe(10);
    expect(propertyIn(t1.nextState, "c")?.capturingUnitId).toBe("i");
    expect(propertyIn(t1.nextState, "c")?.ownerPlayerId).toBeNull();

    // Turn 2: same unit continues, 10 - 10 = 0 → captured.
    const t2 = applyAction(
      readyAgain(t1.nextState),
      capture("i"),
      gd,
      NO_RANDOM,
    );
    expect(t2.events.map((e) => e.type)).toEqual(["property_captured"]);
    const captured = propertyIn(t2.nextState, "c");
    expect(captured?.ownerPlayerId).toBe("p1");
    expect(captured?.capturePointsRemaining).toBe(20); // reset
    expect(captured?.capturingUnitId).toBeNull();
    expect(t2.nextState.units[0]?.captureTargetPropertyId).toBeNull();
  });

  it("#3: a damaged Infantry contributes only its displayed HP", () => {
    const gd = makeGameData();
    const s = state(
      [unit("i", "infantry", "p1", { x: 0, y: 0 }, { trueHp: 55 })], // displayed 6
      [property("c", "city", null, { x: 0, y: 0 })],
    );
    const { nextState } = applyAction(s, capture("i"), gd, NO_RANDOM);
    expect(propertyIn(nextState, "c")?.capturePointsRemaining).toBe(14); // 20 - 6
  });

  it("captures onto a property reached by a legal move", () => {
    const gd = makeGameData();
    const s = state(
      [unit("i", "infantry", "p1", { x: 1, y: 0 })],
      [property("c", "city", null, { x: 0, y: 0 })],
    );
    const { nextState, events } = applyAction(
      s,
      capture("i", [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
      ]),
      gd,
      NO_RANDOM,
    );
    expect(events.map((e) => e.type)).toEqual([
      "unit_moved",
      "capture_started",
      "capture_progressed",
    ]);
    expect(nextState.units[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it("flips ownership of an enemy HQ (the victory signal for M3-T7)", () => {
    const gd = makeGameData();
    const s = state(
      [unit("i", "infantry", "p1", { x: 0, y: 0 }, { trueHp: 100 })],
      [
        property(
          "hq",
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
    const { nextState, events } = applyAction(s, capture("i"), gd, NO_RANDOM);
    expect(events.map((e) => e.type)).toEqual(["property_captured"]);
    expect(propertyIn(nextState, "hq")?.ownerPlayerId).toBe("p1");
  });
});

describe("capture continuity reset (§13.4)", () => {
  it("#2: capture resets when the Infantry leaves the property", () => {
    const gd = makeGameData();
    const s = state(
      [unit("i", "infantry", "p1", { x: 0, y: 0 })],
      [property("c", "city", null, { x: 0, y: 0 })],
    );
    const captured = applyAction(s, capture("i"), gd, NO_RANDOM).nextState;
    expect(propertyIn(captured, "c")?.capturePointsRemaining).toBe(10);

    // Next turn the unit moves away instead of continuing → property resets.
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
      ],
    };
    const after = applyAction(
      readyAgain(captured),
      move,
      gd,
      NO_RANDOM,
    ).nextState;
    expect(propertyIn(after, "c")?.capturePointsRemaining).toBe(20);
    expect(propertyIn(after, "c")?.capturingUnitId).toBeNull();
    expect(after.units[0]?.captureTargetPropertyId).toBeNull();
  });
});

describe("capture validation (§13.1, §13.2)", () => {
  it("rejects a unit that cannot capture", () => {
    const gd = makeGameData();
    const s = state(
      [unit("t", "tank", "p1", { x: 0, y: 0 })],
      [property("c", "city", null, { x: 0, y: 0 })],
    );
    const result = validateAction(s, capture("t"), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_capture");
    }
  });

  it("rejects capturing a property the unit already owns", () => {
    const gd = makeGameData();
    const s = state(
      [unit("i", "infantry", "p1", { x: 0, y: 0 })],
      [property("c", "city", "p1", { x: 0, y: 0 })],
    );
    const result = validateAction(s, capture("i"), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_capture");
    }
  });

  it("rejects capturing where there is no property", () => {
    const gd = makeGameData();
    const s = state([unit("i", "infantry", "p1", { x: 1, y: 0 })], []);
    const result = validateAction(s, capture("i"), gd);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.map((e) => e.code)).toContain("invalid_capture");
    }
  });
});
