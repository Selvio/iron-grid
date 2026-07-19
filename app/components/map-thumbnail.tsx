import { formatMapName } from "@/app/lib/format";
import { cn } from "@/app/lib/utils";

/**
 * A map's real board art, pre-rendered (M9-T10, re-based on sprites in M9-T11).
 *
 * The image is built by `pnpm map-thumbs`, which composites the map through the
 * **same pure render model the Phaser scene uses** (`scripts/atlas/_composite.ts`
 * → `buildTerrainRenderModel` / `buildingTileId`). So this is the board's own
 * autotiles and building art, not an approximation of them — at the cost of one
 * `<img>` and no runtime work.
 *
 * `pixelated` keeps the art crisp where there is room for it (the create form).
 * The dashboard's 48px tile leaves ~3px per tile, where nearest-neighbour reads
 * as noise and smooth downscaling reads as a map, so it opts out.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T11)
 */

/** A map's identity and size — everything a thumbnail needs. */
export interface MapPreview {
  readonly id: string;
  /** Width in tiles. */
  readonly width: number;
  /** Height in tiles. */
  readonly height: number;
}

/** The public path of a map's generated thumbnail. */
export function mapThumbnailSrc(mapId: string): string {
  return `/map-thumbnails/${mapId}.png`;
}

export function MapThumbnail({
  map,
  className,
  pixelated = true,
}: {
  map: MapPreview;
  className?: string;
  /** Nearest-neighbour scaling; turn off below roughly 8px per tile. */
  pixelated?: boolean;
}) {
  return (
    // A static, already-sized sprite composite: next/image's loader would only
    // re-encode it, and smoothing is exactly what we control per use site.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mapThumbnailSrc(map.id)}
      alt={`${formatMapName(map.id)} map preview, ${map.width}×${map.height}`}
      width={map.width}
      height={map.height}
      className={cn("block h-auto w-full object-contain", className)}
      style={pixelated ? { imageRendering: "pixelated" } : undefined}
    />
  );
}
