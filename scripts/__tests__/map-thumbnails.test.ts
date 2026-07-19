import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { loadGameData } from "game-data";

import type { CompositableMap } from "../atlas/_composite";
import {
  MANIFEST_FILE,
  MAP_THUMBNAIL_DIR,
  THUMBNAIL_ZOOM,
  mapSourceHash,
  type ThumbnailManifest,
} from "../map-thumbnails.shared";

/**
 * Guards the generated map thumbnails (M9-T11).
 *
 * The PNGs are committed artifacts, like `atlas.generated.ts`. That is cheap at
 * runtime but goes stale silently — a map edit or a re-cut atlas leaves the UI
 * showing yesterday's board. These tests compare the committed manifest against
 * the live game data, so "changed the map, forgot `pnpm map-thumbs`" fails CI
 * instead of shipping.
 */

// From this file, not `cwd` — Vitest runs projects from the workspace root.
const root = fileURLToPath(new URL("../..", import.meta.url));
const gameData = loadGameData();

function manifest(): ThumbnailManifest {
  return JSON.parse(
    readFileSync(join(root, MANIFEST_FILE), "utf8"),
  ) as ThumbnailManifest;
}

describe("map thumbnails", () => {
  it("has a committed PNG for every official map", () => {
    const built = manifest().maps;
    for (const map of Object.values(gameData.maps)) {
      expect(built[map.id], `no thumbnail for map ${map.id}`).toBeDefined();
      expect(
        existsSync(join(root, MAP_THUMBNAIL_DIR, built[map.id]!.file)),
        `missing file for map ${map.id} — run \`pnpm map-thumbs\``,
      ).toBe(true);
    }
  });

  it("is current with the map data it was built from", () => {
    const built = manifest().maps;
    for (const map of Object.values(gameData.maps)) {
      expect(
        built[map.id]?.sourceHash,
        `${map.id} changed since its thumbnail was built — run \`pnpm map-thumbs\``,
      ).toBe(mapSourceHash(map as unknown as CompositableMap));
    }
  });

  it("is current with the sprite atlas it was drawn from", () => {
    const atlasHash = createHash("sha256")
      .update(readFileSync(join(root, "app/lib/render/atlas.generated.ts")))
      .digest("hex")
      .slice(0, 16);
    expect(
      manifest().atlasHash,
      "the atlas was re-cut since the thumbnails were built — run `pnpm map-thumbs`",
    ).toBe(atlasHash);
  });

  it("records each PNG at the map's size and zoom", () => {
    const built = manifest().maps;
    for (const map of Object.values(gameData.maps)) {
      expect(built[map.id]).toMatchObject({
        width: map.dimensions.width * 16 * THUMBNAIL_ZOOM,
        height: map.dimensions.height * 16 * THUMBNAIL_ZOOM,
      });
    }
  });

  it("drops thumbnails for maps that no longer exist", () => {
    for (const id of Object.keys(manifest().maps)) {
      expect(
        gameData.maps[id],
        `${id} is no longer an official map — run \`pnpm map-thumbs\``,
      ).toBeDefined();
    }
  });
});
