import { describe, expect, it } from "vitest";

import type { MatchView } from "@/app/lib/api-client";
import { fixtureGameData } from "@/app/server/lifecycle/__tests__/fixtures";
import { computePath } from "../path";

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
  mapId: "test-map",
  viewerPlayerId: "me",
  map: { width: 5, height: 4, logicalTerrain: plainRows(5, 4) },
  units: [TANK],
} as unknown as MatchView;

function adjacent(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

describe("computePath", () => {
  it("returns an ordered path from the origin to the destination", () => {
    const path = computePath(VIEW, "u1", { x: 4, y: 3 }, fixtureGameData());
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 2, y: 1 }); // includes origin
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 3 });
    // Every step is an orthogonal neighbor.
    for (let i = 1; i < path!.length; i++) {
      expect(adjacent(path![i - 1], path![i])).toBe(true);
    }
  });

  it("returns a two-tile path for an adjacent destination", () => {
    const path = computePath(VIEW, "u1", { x: 3, y: 1 }, fixtureGameData());
    expect(path).toEqual([
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
  });

  it("returns null for an unknown unit", () => {
    expect(
      computePath(VIEW, "ghost", { x: 0, y: 0 }, fixtureGameData()),
    ).toBeNull();
  });
});
