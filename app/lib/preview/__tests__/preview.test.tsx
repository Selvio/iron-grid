import { describe, expect, it } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { fixtureGameData } from "@/app/server/lifecycle/__tests__/fixtures";
import { matchViewToState } from "../match-state-adapter";
import { previewMovementRange } from "../movement";

function plainRows(width: number, height: number): string[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "plain"),
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

describe("matchViewToState", () => {
  it("rebuilds a preview state that keeps the map id, units and own player", () => {
    const state = matchViewToState(VIEW);
    expect(state.match.mapId).toBe("test-map");
    expect(state.units).toHaveLength(1);
    expect(state.players).toHaveLength(1);
    expect(state.players[0]).toMatchObject({ playerId: "me", funds: 1000 });
  });
});

describe("previewMovementRange", () => {
  it("runs the pure engine against the projected view", () => {
    const reachable = previewMovementRange(VIEW, "u1", fixtureGameData());
    // A tank (move 6) on all-plain terrain reaches several tiles, incl. an
    // orthogonal neighbor, and never leaves the 5×4 board.
    expect(reachable.length).toBeGreaterThan(1);
    expect(reachable).toContainEqual({ x: 3, y: 1 });
    expect(
      reachable.every((c) => c.x >= 0 && c.x < 5 && c.y >= 0 && c.y < 4),
    ).toBe(true);
  });
});
