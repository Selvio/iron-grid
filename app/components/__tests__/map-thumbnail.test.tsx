import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { terrainSwatch } from "@/app/lib/render/terrain-swatch";
import { MapThumbnail } from "../map-thumbnail";

const MAP = {
  id: "spann-island",
  width: 3,
  height: 2,
  terrain: [
    ["sea", "plain", "forest"],
    ["sea", "road", "headquarters"],
  ],
};

describe("MapThumbnail", () => {
  it("names the map and its size for assistive tech", () => {
    render(<MapThumbnail map={MAP} />);
    expect(
      screen.getByRole("img", { name: "Spann Island map preview, 3×2" }),
    ).toBeInTheDocument();
  });

  it("draws one cell per tile, colored by terrain", () => {
    render(<MapThumbnail map={MAP} />);
    const cells = Array.from(
      screen.getByRole("img").querySelectorAll(":scope > span"),
    );
    expect(cells).toHaveLength(6);
    // Row-major: the first cell is (0,0) `sea`, the last is (2,1) `headquarters`.
    expect(cells[0]).toHaveStyle({ backgroundColor: terrainSwatch("sea") });
    expect(cells[5]).toHaveStyle({
      backgroundColor: terrainSwatch("headquarters"),
    });
  });

  it("keeps the map's aspect ratio and column count", () => {
    render(<MapThumbnail map={MAP} />);
    expect(screen.getByRole("img")).toHaveStyle({
      gridTemplateColumns: "repeat(3, 1fr)",
      aspectRatio: "3 / 2",
    });
  });

  it("falls back to a neutral swatch for an unknown terrain id", () => {
    // A future map may carry terrain this palette predates; it must still draw.
    expect(terrainSwatch("quicksand")).toBe(terrainSwatch("__nothing__"));
    render(
      <MapThumbnail
        map={{ id: "x", width: 1, height: 1, terrain: [["quicksand"]] }}
      />,
    );
    expect(screen.getByRole("img").querySelector(":scope > span")).toHaveStyle({
      backgroundColor: terrainSwatch("quicksand"),
    });
  });
});
