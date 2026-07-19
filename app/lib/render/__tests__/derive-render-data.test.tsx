import { describe, expect, it } from "vitest";

import {
  TERRAIN_TILE_PX,
  factionSheetPath,
  frameCount,
  terrainTileFrame,
  unitFrame,
  unitSpriteKey,
} from "../derive-render-data";

describe("unitSpriteKey", () => {
  it("returns the single key for an ordinary unit", () => {
    expect(unitSpriteKey({ sprite_key: "tank" })).toBe("tank");
  });

  it("resolves the submarine surfaced/submerged pair", () => {
    const sub = {
      sprite_keys: { surfaced: "submarine", submerged: "submarine_submerged" },
    };
    expect(unitSpriteKey(sub)).toBe("submarine");
    expect(unitSpriteKey(sub, true)).toBe("submarine_submerged");
  });
});

describe("unitFrame", () => {
  it("returns the atlas rectangle of a clip frame", () => {
    const first = unitFrame("infantry", "idle", 0);
    const second = unitFrame("infantry", "idle", 1);
    expect(first.width).toBeGreaterThan(0);
    expect(first.height).toBeGreaterThan(0);
    // Frames of a clip sit side by side on the sheet.
    expect(second.x).toBeGreaterThan(first.x);
  });

  it("clamps a frame index past the clip's last frame", () => {
    const frames = frameCount("infantry", "idle");
    expect(unitFrame("infantry", "idle", 99)).toEqual(
      unitFrame("infantry", "idle", frames - 1),
    );
  });

  it("falls back to idle for a clip the pack does not draw", () => {
    // Naval units only ship an idle; asking for a walk must not blow up.
    expect(frameCount("battleship", "move_up")).toBe(0);
    expect(unitFrame("battleship", "move_up", 0)).toEqual(
      unitFrame("battleship", "idle", 0),
    );
  });

  it("throws for a unit the atlas has no art for", () => {
    expect(() => unitFrame("no_such_unit")).toThrow(/no sprite frames/i);
  });
});

describe("factionSheetPath", () => {
  it("resolves a unit's sheet for the owning faction", () => {
    expect(factionSheetPath("blue", "infantry")).toBe(
      "/game-assets/units/blue/sprites.png",
    );
    expect(factionSheetPath("yellow", "fighter")).toBe(
      "/game-assets/units/yellow/air.png",
    );
    expect(factionSheetPath("red", "battleship")).toBe(
      "/game-assets/units/red/sea.png",
    );
  });
});

describe("terrainTileFrame", () => {
  it("returns the rectangle of a terrain autotile", () => {
    expect(terrainTileFrame("terrain_plain")).toEqual({
      x: 17,
      y: 17,
      width: TERRAIN_TILE_PX,
      height: TERRAIN_TILE_PX,
    });
  });

  it("throws on an unknown tile id", () => {
    expect(() => terrainTileFrame("not-a-tile")).toThrow(/render-tile id/i);
  });
});
