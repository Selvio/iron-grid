import { describe, expect, it } from "vitest";

import type { MapView } from "@/app/server/actions/read";
import {
  BASE_TERRAIN_TILE,
  FILL_TILE,
  buildTerrainRenderModel,
  coastOverlayTile,
  forestOverlayTile,
  layersForCell,
  mountainOverlayTile,
  neighborMask,
  renderTileFor,
  roadRenderTile,
} from "../terrain-map";

const MAP: MapView = {
  width: 3,
  height: 2,
  logicalTerrain: [
    ["plain", "forest", "mountain"],
    ["plain", "sea", "plain"],
  ],
};

function view(logicalTerrain: string[][]): MapView {
  return {
    width: logicalTerrain[0]!.length,
    height: logicalTerrain.length,
    logicalTerrain,
  };
}

describe("renderTileFor", () => {
  it("maps forest and mountain to their inventory atlas regions", () => {
    expect(renderTileFor("forest")).toBe("terrain_r06_c08");
    expect(renderTileFor("mountain")).toBe("terrain_r02_c07");
  });

  it("uses the opaque grass cell for plains (not the transparent r00_c00)", () => {
    expect(renderTileFor("plain")).toBe("terrain_r01_c01");
    expect(FILL_TILE.plain).toBe("terrain_r01_c01");
    expect(FILL_TILE.sea).toBe("terrain_r01_c00");
  });

  it("falls back to plain for an unmapped terrain", () => {
    expect(renderTileFor("reef")).toBe(renderTileFor("plain"));
  });
});

describe("neighborMask", () => {
  it("sets N/E/S/W bits for matching neighbors", () => {
    const map = view([
      ["sea", "plain", "sea"],
      ["plain", "sea", "plain"],
      ["sea", "plain", "sea"],
    ]);
    // Center sea has land on all four sides.
    expect(neighborMask(map, 1, 1, (t) => t === "plain")).toBe(1 | 2 | 4 | 8);
  });
});

describe("coastOverlayTile", () => {
  it("returns null for open sea and a cliff cell when land borders water", () => {
    const map = view([
      ["sea", "sea", "sea"],
      ["sea", "sea", "plain"],
      ["sea", "sea", "sea"],
    ]);
    expect(coastOverlayTile(map, 0, 0)).toBeNull();
    // Sea at (1,1) has land to the east.
    expect(coastOverlayTile(map, 1, 1)).toBe("terrain_r01_c04");
  });

  it("covers the 16 land-neighbor masks with non-null overlays", () => {
    // Build a 3×3 where center is sea and each orthogonal neighbor is toggled.
    for (let mask = 1; mask <= 15; mask++) {
      const grid = [
        ["sea", "sea", "sea"],
        ["sea", "sea", "sea"],
        ["sea", "sea", "sea"],
      ];
      if (mask & 1) grid[0]![1] = "plain";
      if (mask & 2) grid[1]![2] = "plain";
      if (mask & 4) grid[2]![1] = "plain";
      if (mask & 8) grid[1]![0] = "plain";
      const tile = coastOverlayTile(view(grid), 1, 1);
      expect(tile, `mask ${mask}`).toMatch(/^terrain_r0[0-3]_c0[2-5]$/);
    }
  });
});

describe("roadRenderTile", () => {
  it("uses horizontal asphalt for an E–W road and vertical for N–S", () => {
    const roads = view([
      ["plain", "road", "plain"],
      ["road", "road", "road"],
      ["plain", "road", "plain"],
    ]);
    expect(roadRenderTile(roads, 0, 1)).toBe("terrain_r12_c01");
    expect(roadRenderTile(roads, 1, 0)).toBe("terrain_r12_c00");
    expect(roadRenderTile(roads, 1, 1)).toBe("terrain_r12_c01");
  });
});

describe("forest and mountain overlays", () => {
  it("picks fill tiles for isolated cells and edge variants for neighbors", () => {
    const forests = view([
      ["plain", "forest", "plain"],
      ["forest", "forest", "forest"],
      ["plain", "forest", "plain"],
    ]);
    expect(forestOverlayTile(forests, 1, 1)).toBe(BASE_TERRAIN_TILE.forest);
    expect(forestOverlayTile(forests, 1, 0)).toBe("terrain_r07_c08"); // S neighbor

    const mountains = view([
      ["plain", "mountain", "plain"],
      ["plain", "mountain", "plain"],
      ["plain", "plain", "plain"],
    ]);
    expect(mountainOverlayTile(mountains, 1, 0)).toBe("terrain_r03_c07"); // S
    expect(mountainOverlayTile(mountains, 1, 1)).toBe("terrain_r00_c07"); // N
  });
});

describe("layersForCell", () => {
  it("stacks opaque sea under coast overlays", () => {
    const map = view([
      ["sea", "plain"],
      ["sea", "sea"],
    ]);
    expect(layersForCell(map, 0, 0)).toEqual([
      FILL_TILE.sea,
      "terrain_r01_c04", // land to the east
    ]);
    expect(layersForCell(map, 0, 1)[0]).toBe(FILL_TILE.sea);
  });

  it("stacks grass under forest, mountain and road", () => {
    const map = view([["forest", "mountain", "road"]]);
    expect(layersForCell(map, 0, 0)[0]).toBe(FILL_TILE.plain);
    expect(layersForCell(map, 1, 0)[0]).toBe(FILL_TILE.plain);
    expect(layersForCell(map, 2, 0)).toEqual([
      FILL_TILE.plain,
      "terrain_r12_c00",
    ]);
  });
});

describe("buildTerrainRenderModel", () => {
  it("emits one row-major cell per tile with layers and top render tile", () => {
    const cells = buildTerrainRenderModel(MAP, []);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toMatchObject({ x: 0, y: 0, terrainId: "plain" });
    expect(cells[0]!.layers).toEqual([FILL_TILE.plain]);
    expect(cells[1]).toMatchObject({
      x: 1,
      y: 0,
      terrainId: "forest",
      renderTileId: "terrain_r06_c08",
    });
    expect(cells[1]!.layers[0]).toBe(FILL_TILE.plain);
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
