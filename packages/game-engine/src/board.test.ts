import { describe, expect, it } from "vitest";

import {
  compareBoardOrder,
  displayHp,
  removeUnit,
  replaceUnit,
  unitAt,
  updateMatch,
  updatePlayer,
} from "./board";
import type { MatchState, UnitState } from "./state";

/**
 * M2-T1: the board helpers derive values, look up entities, order
 * deterministically, and — critically — never mutate their input.
 *
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T1)
 */

function unit(
  id: string,
  x: number,
  y: number,
  patch: Partial<UnitState> = {},
): UnitState {
  return {
    id,
    typeId: "infantry",
    ownerPlayerId: "p1",
    position: { x, y },
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

function baseState(): MatchState {
  return {
    match: {
      id: "m1",
      status: "active",
      dataVersion: "1.0.0",
      mapId: "map1",
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
    },
    players: [
      {
        playerId: "p1",
        userId: "u1",
        factionId: "blue",
        commanderId: "commander_blue",
        funds: 1000,
        powerMeter: 0,
        ready: true,
        resigned: false,
      },
    ],
    units: [unit("a", 2, 3), unit("b", 1, 3)],
    properties: [],
    terrainObjects: [],
  };
}

describe("derived values and lookups", () => {
  it("derives displayHp as ceil(trueHp / 10)", () => {
    expect(displayHp(100)).toBe(10);
    expect(displayHp(1)).toBe(1);
    expect(displayHp(55)).toBe(6);
  });

  it("finds a board-occupying unit by coordinate", () => {
    expect(unitAt(baseState(), { x: 2, y: 3 })?.id).toBe("a");
    expect(unitAt(baseState(), { x: 9, y: 9 })).toBeUndefined();
  });

  it("orders positioned entities y asc, x asc, id asc", () => {
    const ordered = [...baseState().units]
      .sort(compareBoardOrder)
      .map((u) => u.id);
    expect(ordered).toEqual(["b", "a"]); // both y=3, x=1 before x=2
  });
});

describe("immutable updates never mutate the input", () => {
  it("replaceUnit returns a new state and leaves the original untouched", () => {
    const before = baseState();
    const snapshot = JSON.stringify(before);
    const after = replaceUnit(before, { ...before.units[0]!, fuel: 5 });
    expect(after).not.toBe(before);
    expect(after.units.find((u) => u.id === "a")?.fuel).toBe(5);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("removeUnit, updatePlayer and updateMatch preserve the input", () => {
    const before = baseState();
    const snapshot = JSON.stringify(before);
    expect(removeUnit(before, "a").units).toHaveLength(1);
    expect(updatePlayer(before, "p1", { funds: 5000 }).players[0]?.funds).toBe(
      5000,
    );
    expect(updateMatch(before, { currentDay: 2 }).match.currentDay).toBe(2);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});
