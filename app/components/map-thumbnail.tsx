import { terrainSwatch } from "@/app/lib/render/terrain-swatch";
import { formatMapName } from "@/app/lib/format";
import { cn } from "@/app/lib/utils";

/**
 * A map's logical terrain as a flat DOM thumbnail (M9-T10).
 *
 * One `<span>` per cell in a CSS grid, colored by `terrainSwatch`. No canvas,
 * no atlas, no asset load — the board's real art is Phaser's job (`frontend.md`
 * §3–§4); this is the small preview the create form and the dashboard row show
 * so a map is recognizable before you open it.
 *
 * It is a single `role="img"` with a label naming the map and its size, so the
 * grid's hundreds of cells never reach assistive tech as noise.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T10)
 */

/** A map's identity and layout — everything a thumbnail needs. */
export interface MapPreview {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  /** `logical_terrain`, row-major: `terrain[y][x]` is a terrain id. */
  readonly terrain: readonly (readonly string[])[];
}

export function MapThumbnail({
  map,
  className,
}: {
  map: MapPreview;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`${formatMapName(map.id)} map preview, ${map.width}×${map.height}`}
      className={cn("grid overflow-hidden", className)}
      style={{
        gridTemplateColumns: `repeat(${map.width}, 1fr)`,
        aspectRatio: `${map.width} / ${map.height}`,
      }}
    >
      {map.terrain.flatMap((row, y) =>
        row.map((terrainId, x) => (
          <span
            key={`${x},${y}`}
            style={{ backgroundColor: terrainSwatch(terrainId) }}
          />
        )),
      )}
    </span>
  );
}
