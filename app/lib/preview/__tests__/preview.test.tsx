import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";

import type { MatchView } from "@/app/lib/api-client";
import { fixtureGameData } from "@/app/server/lifecycle/__tests__/fixtures";
import { matchViewToState } from "../match-state-adapter";
import { previewMovementRange } from "../movement";
import { previewTerrainStars } from "../actions";

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

/**
 * A game-data fixture whose blue commander has an *approved* terrain-scoped
 * passive: +1 defense star in a forest, like the shipped green one (ADR-0006).
 * Synthetic on purpose — this asserts the client wiring, not the design.
 */
function terrainPassiveGameData(): GameData {
  const data = fixtureGameData() as unknown as Record<string, never>;
  const gd = data as unknown as {
    terrain: Record<string, unknown>;
    commanders: { commanders: Record<string, unknown> };
    maps: Record<string, { logical_terrain: string[][] }>;
  };
  gd.terrain.forest = {
    ...(gd.terrain.plain as object),
    defense_stars: 2,
  };
  gd.commanders.commanders["cmdr-blue"] = {
    id: "cmdr-blue",
    faction_id: "blue",
    status: "blocked",
    passive: {
      status: "approved",
      display_name: "Entrenched (test)",
      description: "+1 star in forest.",
      modifiers: [
        {
          id: "t1",
          target: "terrain_defense_stars",
          operation: "add",
          value: 1,
          scope: { type: "terrain_ids", values: ["forest"] },
          priority: 100,
        },
      ],
    },
  };
  return gd as unknown as GameData;
}

describe("previewTerrainStars", () => {
  it("adds the owner's terrain passive to the tile's own stars", () => {
    const gameData = terrainPassiveGameData();
    const view = {
      ...VIEW,
      map: {
        ...VIEW.map,
        logicalTerrain: VIEW.map.logicalTerrain.map((row, y) =>
          y === 1 ? row.map((t, x) => (x === 2 ? "forest" : t)) : row,
        ),
      },
    } as unknown as MatchView;
    // The tank stands on (2,1): forest is worth 2, the passive makes it 3.
    expect(previewTerrainStars(view, "u1", gameData)).toBe(3);
  });

  it("reports the plain tile's stars when no passive applies", () => {
    expect(previewTerrainStars(VIEW, "u1", fixtureGameData())).toBe(0);
  });

  it("gives an off-board or unknown unit nothing", () => {
    expect(previewTerrainStars(VIEW, "nope", fixtureGameData())).toBe(0);
  });
});
