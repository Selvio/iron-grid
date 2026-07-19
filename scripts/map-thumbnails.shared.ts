import { createHash } from "node:crypto";

import type { CompositableMap } from "./atlas/_composite";

/**
 * The contract between the thumbnail build and the staleness test (M9-T11).
 *
 * Kept apart from `build-map-thumbnails.ts` because that module runs its build
 * on import — a test that pulled it in would rewrite `public/` as a side effect.
 */

/** Where the generated PNGs live, relative to the repo root. */
export const MAP_THUMBNAIL_DIR = "public/map-thumbnails";

/** The manifest recording what each PNG was built from. */
export const MANIFEST_FILE = `${MAP_THUMBNAIL_DIR}/manifest.json`;

/** Source pixels per tile pixel. 2 keeps a 15×10 map crisp at card width. */
export const THUMBNAIL_ZOOM = 2;

export interface ThumbnailManifest {
  /** Digest of `atlas.generated.ts` — new sprite geometry invalidates the art. */
  atlasHash: string;
  maps: Record<
    string,
    {
      file: string;
      width: number;
      height: number;
      /** Digest of the map inputs the compositor reads. */
      sourceHash: string;
    }
  >;
}

/**
 * A digest of exactly what the compositor draws from a map: its size, its
 * terrain grid and its properties. Starting units are excluded — the thumbnail
 * does not draw them, so changing them must not mark it stale.
 */
export function mapSourceHash(map: CompositableMap): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        dimensions: map.dimensions,
        terrain: map.logical_terrain,
        properties: map.properties,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}
