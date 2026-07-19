import { describe, expect, it } from "vitest";

import type { GameData } from "game-data";
import type { MatchView } from "@/app/lib/api-client";
import { fixtureGameData } from "@/app/server/lifecycle/__tests__/fixtures";
import {
  actionsAtDestination,
  attackRangeTiles,
  isIndirect,
  previewProduction,
  previewUnitMenu,
  productionTargetAt,
} from "../actions";

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
      supplyDestinations: [],
      joinDestinations: [],
      loadDestinations: [],
      unloadDestinations: [],
      diveDestinations: [],
      surfaceDestinations: [],
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
    supplyDestinations: [{ x: 0, y: 0 }],
    joinDestinations: [{ x: 1, y: 0 }],
    loadDestinations: [],
    unloadDestinations: [],
    diveDestinations: [],
    surfaceDestinations: [],
  };

  it("reports the actions legal from a chosen tile", () => {
    expect(actionsAtDestination(menu, { x: 1, y: 0 })).toEqual({
      canWait: true,
      canCapture: true,
      attackTargets: ["e1", "e2"],
      canSupply: false,
      canJoin: true,
      canLoad: false,
      canUnload: false,
      canDive: false,
      canSurface: false,
    });
  });

  it("reports wait/attack/supply at a non-capturable tile", () => {
    expect(actionsAtDestination(menu, { x: 0, y: 0 })).toEqual({
      canWait: true,
      canCapture: false,
      attackTargets: ["e3"],
      canSupply: true,
      canJoin: false,
      canLoad: false,
      canUnload: false,
      canDive: false,
      canSurface: false,
    });
  });

  it("reports nothing at an unreachable tile", () => {
    expect(actionsAtDestination(menu, { x: 4, y: 4 })).toEqual({
      canWait: false,
      canCapture: false,
      attackTargets: [],
      canSupply: false,
      canJoin: false,
      canLoad: false,
      canUnload: false,
      canDive: false,
      canSurface: false,
    });
  });
});

// --- Attack range (the red threat hatch) ---------------------------------------

describe("attackRangeTiles", () => {
  /** A 5×4 map with `unit` at (2,1); ranges come from `gameData`. */
  function rangeView(unit: Record<string, unknown>): MatchView {
    return { ...VIEW, units: [{ ...TANK, ...unit }] } as unknown as MatchView;
  }

  const rangeGameData = (
    combat: Record<string, unknown>,
    canMoveAndAttack: boolean,
  ): GameData =>
    ({
      units: {
        tank: { combat, movement: { can_move_and_attack: canMoveAndAttack } },
      },
    }) as unknown as GameData;

  it("rings an indirect unit's origin between min and max range", () => {
    const tiles = attackRangeTiles(
      rangeView({}),
      rangeGameData({ min_range: 2, max_range: 3 }, false),
      "u1",
    );
    const keys = tiles.map((c) => `${c.x},${c.y}`);

    expect(keys).toContain("0,1"); // distance 2
    expect(keys).toContain("2,3"); // distance 2, still on the map
    expect(keys).not.toContain("2,2"); // distance 1 — inside the minimum
    expect(keys).not.toContain("2,1"); // its own tile
    expect(keys.every((k) => !k.startsWith("-"))).toBe(true); // clipped to the map
  });

  it("returns nothing for a unit that moves and fires", () => {
    // A direct unit's threat is its move range plus one, which the blue wash
    // already shows; hatching it would bury the board in red.
    const gd = rangeGameData({ min_range: 1, max_range: 1 }, true);
    expect(attackRangeTiles(rangeView({}), gd, "u1")).toEqual([]);
    expect(isIndirect(gd, "tank")).toBe(false);
  });

  it("returns nothing for an unarmed unit", () => {
    expect(
      attackRangeTiles(
        rangeView({}),
        rangeGameData({ min_range: null, max_range: null }, false),
        "u1",
      ),
    ).toEqual([]);
    expect(
      isIndirect(
        rangeGameData({ min_range: null, max_range: null }, false),
        "tank",
      ),
    ).toBe(false);
  });
});

// --- Production (build menu) ---------------------------------------------------

function productionGameData(): GameData {
  return {
    units: {
      infantry: {
        enabled_in_mvp: true,
        cost: 1000,
        display_name: "Infantry",
        rendering: { sprite_key: "infantry" },
        category: "ground",
        movement: { points: 3, type: "foot" },
        vision: { base_range: 2 },
        logistics: { max_fuel: 99, max_ammo: null },
        combat: {
          primary_weapon_id: "machine_gun",
          secondary_weapon_id: null,
        },
      },
      tank: {
        enabled_in_mvp: true,
        cost: 7000,
        display_name: "Tank",
        rendering: { sprite_key: "tank" },
      },
      wip: { enabled_in_mvp: false, cost: 500, display_name: "WIP" },
    },
    weapons: { machine_gun: { display_name: "Machine Gun" } },
    properties: {
      base: {
        production: {
          category: "ground",
          allowed_unit_ids: ["infantry", "tank", "wip"],
        },
      },
      city: { production: { category: "none", allowed_unit_ids: [] } },
    },
  } as unknown as GameData;
}

function productionView(units: unknown[] = []): MatchView {
  return {
    ...VIEW,
    units,
    properties: [
      {
        id: "b1",
        typeId: "base",
        position: { x: 1, y: 1 },
        ownerPlayerId: "me",
      },
      {
        id: "c1",
        typeId: "city",
        position: { x: 2, y: 2 },
        ownerPlayerId: "me",
      },
      {
        id: "e1",
        typeId: "base",
        position: { x: 3, y: 3 },
        ownerPlayerId: "foe",
      },
    ],
    you: { ...VIEW.you, funds: 5000 },
  } as unknown as MatchView;
}

describe("productionTargetAt", () => {
  const gd = productionGameData();

  it("returns an owned, empty production property", () => {
    expect(productionTargetAt(productionView(), gd, 1, 1)).toMatchObject({
      id: "b1",
    });
  });

  it("returns null for a non-producing property, an enemy base, or empty ground", () => {
    const v = productionView();
    expect(productionTargetAt(v, gd, 2, 2)).toBeNull(); // city (category none)
    expect(productionTargetAt(v, gd, 3, 3)).toBeNull(); // enemy base
    expect(productionTargetAt(v, gd, 0, 0)).toBeNull(); // no property
  });

  it("returns null when a unit occupies the base tile", () => {
    const occupied = productionView([
      { id: "u1", ownerPlayerId: "me", position: { x: 1, y: 1 } },
    ]);
    expect(productionTargetAt(occupied, gd, 1, 1)).toBeNull();
  });
});

describe("previewProduction", () => {
  it("lists the enabled roster with cost + affordability, excluding disabled units", () => {
    const gd = productionGameData();
    const v = productionView();
    const base = v.properties.find((p) => p.id === "b1")!;
    const options = previewProduction(v, gd, base);

    expect(options.map((o) => o.unitTypeId)).toEqual(["infantry", "tank"]);
    expect(options[0]).toMatchObject({
      displayName: "Infantry",
      affordable: true,
    });
    expect(options[1]).toMatchObject({
      displayName: "Tank",
      affordable: false,
    });
  });

  it("attaches the intel read-out (move/vision/gas/weapons) for each unit", () => {
    const gd = productionGameData();
    const v = productionView();
    const base = v.properties.find((p) => p.id === "b1")!;
    const [infantry] = previewProduction(v, gd, base);

    expect(infantry?.stats).toEqual({
      move: 3,
      vision: 2,
      gas: 99,
      ammo: null,
      weapon1: "Machine Gun",
      weapon2: null,
      mobility: "Foot",
      mobilityKey: "hud_mobility_foot",
      domain: "ground",
    });
  });

  it("attaches the viewer-faction idle sprite for the menu icon", () => {
    const gd = productionGameData();
    const v = productionView(); // viewer faction is blue (from VIEW)
    const base = v.properties.find((p) => p.id === "b1")!;
    const [infantry, tank] = previewProduction(v, gd, base);

    // The crop is the unit's idle frame on the viewer's faction sheet.
    expect(infantry?.sprite).toMatchObject({
      sheetUrl: "/game-assets/units/blue/sprites.png",
    });
    expect(infantry?.sprite).toEqual(
      expect.objectContaining({
        frameWidth: expect.any(Number),
        frameHeight: expect.any(Number),
      }),
    );
    // Different units crop different parts of the same sheet.
    expect(tank?.sprite?.sheetUrl).toBe("/game-assets/units/blue/sprites.png");
    expect(tank?.sprite?.frameY).not.toBe(infantry?.sprite?.frameY);
  });
});
