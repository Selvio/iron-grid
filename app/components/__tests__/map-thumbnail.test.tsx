import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MapThumbnail, mapThumbnailSrc } from "../map-thumbnail";

const MAP = { id: "spann-island", width: 15, height: 10 };

describe("MapThumbnail", () => {
  it("shows the map's pre-built board art, named for assistive tech", () => {
    render(<MapThumbnail map={MAP} />);
    const img = screen.getByRole("img", {
      name: "Spann Island map preview, 15×10",
    });
    expect(img).toHaveAttribute("src", "/map-thumbnails/spann-island.png");
  });

  it("scales nearest-neighbour by default, and smoothly when asked", () => {
    const { rerender } = render(<MapThumbnail map={MAP} />);
    expect(screen.getByRole("img")).toHaveStyle({
      imageRendering: "pixelated",
    });

    rerender(<MapThumbnail map={MAP} pixelated={false} />);
    expect(screen.getByRole("img")).not.toHaveStyle({
      imageRendering: "pixelated",
    });
  });

  it("derives the thumbnail path from the map id", () => {
    expect(mapThumbnailSrc("twin-peaks")).toBe(
      "/map-thumbnails/twin-peaks.png",
    );
  });
});
