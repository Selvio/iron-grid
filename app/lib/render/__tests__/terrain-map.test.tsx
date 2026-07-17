import { describe, expect, it } from "vitest";

import type { MapView } from "@/app/server/actions/read";
import { buildTerrainRenderModel, renderTileFor } from "../terrain-map";

const MAP: MapView = {
  width: 3,
  height: 2,
  logicalTerrain: [
    ["plain", "forest", "mountain"],
    ["plain", "sea", "plain"],
  ],
};

describe("renderTileFor", () => {
  it("maps a confirmed terrain to its base tile", () => {
    expect(renderTileFor("forest")).toBe("terrain_r02_c07");
  });

  it("falls back to plain for an unmapped terrain", () => {
    expect(renderTileFor("reef")).toBe(renderTileFor("plain"));
  });
});

describe("buildTerrainRenderModel", () => {
  it("emits one row-major cell per tile with its render tile", () => {
    const cells = buildTerrainRenderModel(MAP, []);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toMatchObject({ x: 0, y: 0, terrainId: "plain" });
    expect(cells[1]).toMatchObject({
      x: 1,
      y: 0,
      terrainId: "forest",
      renderTileId: "terrain_r02_c07",
    });
    // row-major: index 3 is (x:0, y:1).
    expect(cells[3]).toMatchObject({ x: 0, y: 1 });
  });

  it("flags fog from the visible-tile set", () => {
    const cells = buildTerrainRenderModel(MAP, [
      { x: 0, y: 0 },
      { x: 2, y: 1 },
    ]);
    const at = (x: number, y: number) =>
      cells.find((c) => c.x === x && c.y === y)!;
    expect(at(0, 0).visible).toBe(true);
    expect(at(2, 1).visible).toBe(true);
    expect(at(1, 0).visible).toBe(false);
  });
});
