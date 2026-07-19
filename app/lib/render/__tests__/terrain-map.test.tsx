import { describe, expect, it } from "vitest";

import { ATLAS } from "@/app/lib/render/atlas";
import type { MapView } from "@/app/server/actions/read";
import {
  beachTile,
  bridgeTile,
  buildTerrainRenderModel,
  layersForCell,
  renderTileFor,
  riverTile,
  roadTile,
  seaChannelEdges,
  seaCorners,
  seaTile,
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

const keys = (map: MapView, x: number, y: number): string[] =>
  layersForCell(map, x, y).map((l) => l.key);

describe("renderTileFor", () => {
  it("maps each terrain to an atlas tile that exists", () => {
    for (const terrain of [
      "plain",
      "forest",
      "mountain",
      "hill",
      "road",
      "river",
      "sea",
      "reef",
      "shoal",
      "bridge",
    ]) {
      expect(ATLAS, terrain).toHaveProperty(renderTileFor(terrain));
    }
  });

  it("falls back to plain for an unmapped terrain", () => {
    expect(renderTileFor("pipe")).toBe("terrain_plain");
  });
});

describe("seaTile", () => {
  it("keeps open water on the plain sea tile", () => {
    const map = view([
      ["sea", "sea", "sea"],
      ["sea", "sea", "sea"],
      ["sea", "sea", "sea"],
    ]);
    expect(seaTile(map, 1, 1)).toBe("terrain_sea");
  });

  it("turns the coast toward the land that borders it", () => {
    const east = view([
      ["sea", "sea", "sea"],
      ["sea", "sea", "plain"],
      ["sea", "sea", "sea"],
    ]);
    expect(seaTile(east, 1, 1)).toBe("terrain_sea_right");

    const north = view([
      ["sea", "plain", "sea"],
      ["sea", "sea", "sea"],
      ["sea", "sea", "sea"],
    ]);
    expect(seaTile(north, 1, 1)).toBe("terrain_sea_top");
  });

  it("uses a corner tile where two adjacent sides are land", () => {
    const map = view([
      ["sea", "plain", "sea"],
      ["sea", "sea", "plain"],
      ["sea", "sea", "sea"],
    ]);
    // The tile is named for where the land is: north and east.
    expect(seaTile(map, 1, 1)).toBe("terrain_sea_top_right");
  });

  it("adds a rounded corner sticker for land that only touches diagonally", () => {
    const map = view([
      ["plain", "sea", "sea"],
      ["sea", "sea", "sea"],
      ["sea", "sea", "sea"],
    ]);
    expect(seaCorners(map, 1, 1)).toEqual([
      { key: "terrain_sea_corner_top_left", dx: 0, dy: -8 },
    ]);
    // With the land orthogonally adjacent the edge tile draws the shore instead.
    const orthogonal = view([
      ["plain", "plain", "sea"],
      ["sea", "sea", "sea"],
      ["sea", "sea", "sea"],
    ]);
    expect(seaCorners(orthogonal, 1, 1)).toEqual([]);
  });

  it("layers half-edge shores on a 1-tile channel between opposite land", () => {
    // Land north+south, water east+west → horizontal channel.
    const ns = view([
      ["plain", "plain", "plain"],
      ["sea", "sea", "sea"],
      ["plain", "plain", "plain"],
    ]);
    expect(seaTile(ns, 1, 1)).toBe("terrain_sea");
    expect(seaChannelEdges(ns, 1, 1)).toEqual([
      { key: "terrain_sea_edge_top", dx: 0, dy: -8 },
      { key: "terrain_sea_edge_bottom", dx: 0, dy: 0 },
    ]);
    expect(keys(ns, 1, 1)).toEqual([
      "terrain_sea",
      "terrain_sea_edge_top",
      "terrain_sea_edge_bottom",
    ]);

    // Land east+west, water north+south → vertical channel.
    const ew = view([
      ["sea", "plain", "sea"],
      ["sea", "plain", "sea"],
      ["sea", "plain", "sea"],
    ]);
    // Center of the middle row is land; use the water cell west of it.
    expect(seaTile(ew, 0, 1)).toBe("terrain_sea_right");
    // A true E+W land channel: water with plain on both sides.
    const vertical = view([
      ["sea", "sea", "sea"],
      ["plain", "sea", "plain"],
      ["sea", "sea", "sea"],
    ]);
    expect(seaTile(vertical, 1, 1)).toBe("terrain_sea");
    expect(seaChannelEdges(vertical, 1, 1)).toEqual([
      { key: "terrain_sea_edge_left", dx: 0, dy: 0 },
      { key: "terrain_sea_edge_right", dx: 8, dy: 0 },
    ]);
  });
});

describe("beachTile", () => {
  it("faces the sand toward the water", () => {
    const map = view([
      ["sea", "sea", "sea"],
      ["shoal", "shoal", "shoal"],
      ["plain", "plain", "plain"],
    ]);
    // Ground to the south only → the sand's top edge meets the sea.
    expect(beachTile(map, 1, 1)).toBe("terrain_beach_top");
  });

  it("fills the corner where only one side is open water", () => {
    const map = view([
      ["plain", "sea", "plain"],
      ["plain", "shoal", "plain"],
      ["plain", "plain", "plain"],
    ]);
    expect(beachTile(map, 1, 1)).toBe("terrain_beach_filled_bottom");
  });
});

describe("riverTile", () => {
  it("runs straight, turns and forks by its flowing neighbors", () => {
    const cross = view([
      ["plain", "river", "plain"],
      ["river", "river", "river"],
      ["plain", "river", "plain"],
    ]);
    expect(riverTile(cross, 1, 1)).toBe("terrain_river_center");

    const horizontal = view([["river", "river", "river"]]);
    expect(riverTile(horizontal, 1, 0)).toBe("terrain_river_horizontal");

    const turn = view([
      ["plain", "river", "plain"],
      ["plain", "river", "river"],
      ["plain", "plain", "plain"],
    ]);
    // Flows in from the north and out to the east.
    expect(riverTile(turn, 1, 1)).toBe("terrain_river_turn_top_right");
  });

  it("caps a stub that ends on land", () => {
    const stub = view([
      ["plain", "river", "plain"],
      ["plain", "river", "plain"],
      ["plain", "plain", "plain"],
    ]);
    expect(riverTile(stub, 1, 1)).toBe("terrain_river_bottom_end");
  });
});

describe("roadTile", () => {
  it("picks straights, junctions and turns", () => {
    const roads = view([
      ["plain", "road", "plain"],
      ["road", "road", "road"],
      ["plain", "road", "plain"],
    ]);
    expect(roadTile(roads, 1, 1)).toBe("terrain_road_center");
    expect(roadTile(roads, 0, 1)).toBe("terrain_road_horizontal");
    expect(roadTile(roads, 1, 0)).toBe("terrain_road_vertical");

    const tee = view([
      ["plain", "plain", "plain"],
      ["road", "road", "road"],
      ["plain", "road", "plain"],
    ]);
    expect(roadTile(tee, 1, 1)).toBe("terrain_road_t_bottom");
  });
});

describe("bridgeTile", () => {
  it("lays the deck across the water it spans", () => {
    // Water to the east and west: the channel runs that way, deck north-south.
    const eastWestChannel = view([["sea", "bridge", "sea"]]);
    expect(bridgeTile(eastWestChannel, 1, 0)).toBe("terrain_bridge_vertical");

    // Water above and below: deck east-west, carrying the road across.
    const northSouthChannel = view([["sea"], ["bridge"], ["sea"]]);
    expect(bridgeTile(northSouthChannel, 0, 1)).toBe(
      "terrain_bridge_horizontal",
    );
  });

  it("draws the water under the deck", () => {
    const map = view([["sea", "bridge", "sea"]]);
    expect(keys(map, 1, 0)).toEqual(["terrain_sea", "terrain_bridge_vertical"]);
  });
});

describe("layersForCell", () => {
  it("draws water as a single self-contained autotile", () => {
    const map = view([
      ["sea", "sea", "sea"],
      ["sea", "sea", "plain"],
      ["sea", "sea", "sea"],
    ]);
    expect(keys(map, 1, 1)).toEqual(["terrain_sea_right"]);
  });

  it("stacks grass under raised features", () => {
    const map = view([["forest", "mountain", "road"]]);
    expect(keys(map, 0, 0)).toEqual(["terrain_plain", "terrain_forest"]);
    expect(keys(map, 1, 0)).toEqual([
      "terrain_plain_shadow",
      "terrain_mountain",
    ]);
    expect(keys(map, 2, 0)).toEqual(["terrain_road_horizontal"]);
  });

  it("shades the plain east of a raised feature, where its shadow falls", () => {
    const map = view([["mountain", "plain", "plain"]]);
    expect(keys(map, 1, 0)).toEqual(["terrain_plain_shadow"]);
    expect(keys(map, 2, 0)).toEqual(["terrain_plain"]);
  });

  it("draws bare grass under a property, which the property layer covers", () => {
    const map = view([["city", "base"]]);
    expect(keys(map, 1, 0)).toEqual(["terrain_plain"]);
  });
});

describe("buildTerrainRenderModel", () => {
  it("emits one row-major cell per tile with layers and top render tile", () => {
    const cells = buildTerrainRenderModel(MAP, []);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toMatchObject({ x: 0, y: 0, terrainId: "plain" });
    expect(cells[1]).toMatchObject({
      x: 1,
      y: 0,
      terrainId: "forest",
      renderTileId: "terrain_forest",
    });
    // row-major: index 3 is (x:0, y:1).
    expect(cells[3]).toMatchObject({ x: 0, y: 1 });
  });

  it("only emits tiles the atlas can draw", () => {
    for (const cell of buildTerrainRenderModel(MAP, [])) {
      for (const layer of cell.layers) {
        expect(ATLAS, `${cell.terrainId} → ${layer.key}`).toHaveProperty(
          layer.key,
        );
      }
    }
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
