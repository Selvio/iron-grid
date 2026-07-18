import { describe, expect, it } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { fixtureGameData } from "@/app/server/lifecycle/__tests__/fixtures";
import { actionsAtDestination, previewUnitMenu } from "../actions";

function plainRows(w: number, h: number): string[][] {
  return Array.from({ length: h }, () =>
    Array.from({ length: w }, () => "plain"),
  );
}

const TANK = {
  id: "u1",
  typeId: "tank",
  ownerPlayerId: "me",
  position: { x: 2, y: 1 },
  trueHp: 100,
  fuel: 70,
  ammo: 9,
  hasActed: false,
  captureTargetPropertyId: null,
  cargoUnitIds: [],
  specialState: null,
  createdTurn: 0,
};

const VIEW = {
  matchId: "m1",
  status: "active",
  currentDay: 1,
  stateVersion: 4,
  activePlayerId: "me",
  turnDeadlineAt: null,
  viewerPlayerId: "me",
  mapId: "test-map",
  map: { width: 5, height: 4, logicalTerrain: plainRows(5, 4) },
  visibleTiles: [],
  units: [TANK],
  properties: [],
  unitRender: {},
  you: {
    playerId: "me",
    factionId: "blue",
    commanderId: "cmdr-blue",
    funds: 1000,
    powerMeter: 0,
    resigned: false,
  },
  opponent: null,
  winnerPlayerId: null,
  completionReason: null,
} as unknown as MatchView;

describe("previewUnitMenu", () => {
  it("digests the movable unit's legal move destinations from the pure engine", () => {
    const menu = previewUnitMenu(VIEW, "u1", fixtureGameData());
    const keys = menu.moveDestinations.map((c) => `${c.x},${c.y}`);
    expect(keys).toContain("2,1"); // origin (waiting in place is legal)
    expect(keys).toContain("3,1"); // a reachable neighbor
    // The fixture carries no enemies or weapons/damage tables.
    expect(menu.attacks).toEqual([]);
    expect(menu.captureDestinations).toEqual([]);
  });

  it("returns an empty menu for an unknown unit", () => {
    const menu = previewUnitMenu(VIEW, "ghost", fixtureGameData());
    expect(menu).toEqual({
      moveDestinations: [],
      captureDestinations: [],
      attacks: [],
    });
  });
});

describe("actionsAtDestination", () => {
  const menu = {
    moveDestinations: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
    captureDestinations: [{ x: 1, y: 0 }],
    attacks: [
      { from: { x: 1, y: 0 }, targetUnitId: "e1" },
      { from: { x: 1, y: 0 }, targetUnitId: "e2" },
      { from: { x: 0, y: 0 }, targetUnitId: "e3" },
    ],
  };

  it("reports the actions legal from a chosen tile", () => {
    expect(actionsAtDestination(menu, { x: 1, y: 0 })).toEqual({
      canWait: true,
      canCapture: true,
      attackTargets: ["e1", "e2"],
    });
  });

  it("reports only wait/attack at a non-capturable tile", () => {
    expect(actionsAtDestination(menu, { x: 0, y: 0 })).toEqual({
      canWait: true,
      canCapture: false,
      attackTargets: ["e3"],
    });
  });

  it("reports nothing at an unreachable tile", () => {
    expect(actionsAtDestination(menu, { x: 4, y: 4 })).toEqual({
      canWait: false,
      canCapture: false,
      attackTargets: [],
    });
  });
});
