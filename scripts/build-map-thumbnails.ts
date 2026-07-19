import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadGameData } from "game-data";

import { compositeMap, type CompositableMap } from "./atlas/_composite";
import {
  MAP_THUMBNAIL_DIR,
  MANIFEST_FILE,
  THUMBNAIL_ZOOM,
  mapSourceHash,
  type ThumbnailManifest,
} from "./map-thumbnails.shared";

/**
 * Build the map thumbnails the create form and the dashboard show
 * (`pnpm map-thumbs`, M9-T11).
 *
 * Each official map is composited through `_composite.ts` — the same pure
 * render model the Phaser scene runs — into `public/map-thumbnails/<id>.png`.
 * Pre-rendering rather than drawing sprites in the DOM keeps a thumbnail at one
 * `<img>` node and zero runtime cost, and follows the convention already set by
 * `atlas.generated.ts`: a generated artifact, committed, rebuilt by a script.
 *
 * Starting **units are not drawn**: a thumbnail previews the map, and the
 * armies belong to a match's state. Properties are, in their slot colors —
 * they are terrain you can see from the map alone.
 *
 * The manifest records what each PNG was built from, so a test can fail when a
 * map or the atlas changes and the thumbnails are left stale.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T11)
 */

const gameData = loadGameData();
const outDir = join(process.cwd(), MAP_THUMBNAIL_DIR);
mkdirSync(outDir, { recursive: true });

const atlasHash = createHash("sha256")
  .update(
    readFileSync(join(process.cwd(), "app/lib/render/atlas.generated.ts")),
  )
  .digest("hex")
  .slice(0, 16);

const manifest: ThumbnailManifest = { atlasHash, maps: {} };

for (const map of Object.values(gameData.maps)) {
  const compositor = compositeMap(map as unknown as CompositableMap, {
    zoom: THUMBNAIL_ZOOM,
    units: false,
    background: null,
  });
  const file = `${map.id}.png`;
  writeFileSync(join(outDir, file), compositor.toBuffer());
  manifest.maps[map.id] = {
    file,
    width: compositor.png.width,
    height: compositor.png.height,
    sourceHash: mapSourceHash(map as unknown as CompositableMap),
  };
  console.log(
    `${map.id} → ${MAP_THUMBNAIL_DIR}/${file} (${compositor.png.width}×${compositor.png.height})`,
  );
}

writeFileSync(
  join(process.cwd(), MANIFEST_FILE),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `${Object.keys(manifest.maps).length} thumbnails → ${MANIFEST_FILE}`,
);
