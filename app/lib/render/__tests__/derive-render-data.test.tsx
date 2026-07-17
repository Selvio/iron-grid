import { describe, expect, it } from "vitest";

import {
  factionSheetPath,
  terrainTileFrame,
  unitFrame,
  unitSpriteRow,
} from "../derive-render-data";

describe("unitSpriteRow", () => {
  it("returns the single row for an ordinary unit", () => {
    // tank → row 9 (units.yaml).
    expect(unitSpriteRow({ sprite_row: 9 })).toBe(9);
  });

  it("resolves the submarine surfaced/submerged pair", () => {
    const sub = { sprite_rows: { surfaced: 40, submerged: 39 } };
    expect(unitSpriteRow(sub)).toBe(40);
    expect(unitSpriteRow(sub, true)).toBe(39);
  });
});

describe("unitFrame", () => {
  it("places the idle frame of row 0 below the 16px header", () => {
    expect(unitFrame(0, "idle", 0)).toEqual({
      x: 0,
      y: 16,
      width: 32,
      height: 32,
    });
  });

  it("maps animation + frame index to the right column and row", () => {
    // tank (row 9), attack frame 2 → column 19.
    expect(unitFrame(9, "attack", 2)).toEqual({
      x: 19 * 32,
      y: 16 + 9 * 32,
      width: 32,
      height: 32,
    });
  });

  it("clamps a frame index past the animation's last frame", () => {
    // hit has three frames [21,22,23]; index 5 clamps to 23.
    expect(unitFrame(0, "hit", 5).x).toBe(23 * 32);
  });
});

describe("factionSheetPath", () => {
  it("resolves each faction to its bundled sheet", () => {
    expect(factionSheetPath("blue")).toBe(
      "/game-assets/units/blue-units-sprite-sheet.png",
    );
    expect(factionSheetPath("yellow")).toBe(
      "/game-assets/units/yellow-units-sprite-sheet.png",
    );
  });
});

describe("terrainTileFrame", () => {
  it("parses a stable render-tile id into a 24px tileset rect", () => {
    expect(terrainTileFrame("terrain_r04_c07")).toEqual({
      x: 7 * 24,
      y: 4 * 24,
      width: 24,
      height: 24,
    });
  });

  it("throws on a malformed id", () => {
    expect(() => terrainTileFrame("not-a-tile")).toThrow(/render-tile id/i);
  });
});
