import type { UnitSprite } from "@/app/lib/preview/actions";
import { atlasEntry, spriteStyle } from "@/app/lib/render/atlas";

/**
 * A pixel-art crop of a sprite sheet, for the DOM parts of the UI (build menu,
 * action menu, HUD) that show a unit outside the Phaser canvas.
 *
 * The art pack's frames are not square and not uniform, so the crop keeps its
 * source size and is scaled with `transform` — a percentage `background-size`
 * would resolve against the element, not the sheet — and is centered inside a
 * fixed box so rows of differently sized units still line up.
 */
/**
 * Any atlas entry as a DOM sprite — the HUD icons and word labels the original
 * game uses for stats (`hud_*`), so the panels read in the pack's own language
 * instead of a generic icon set. Renders nothing for a key the pack lacks.
 */
export function AtlasSprite({
  atlasKey,
  scale = 1,
  className,
}: {
  atlasKey: string;
  scale?: number;
  className?: string;
}) {
  const entry = atlasEntry(atlasKey);
  if (entry === null) return null;
  const { outer, inner } = spriteStyle(entry, undefined, scale);
  return (
    <span
      aria-hidden
      className={className}
      style={{ ...outer, display: "block" }}
    >
      <span className="block" style={inner} />
    </span>
  );
}

export function PixelSprite({
  sprite,
  box,
  scale = 2,
}: {
  sprite: UnitSprite | null;
  /** Size of the square the sprite is centered in (defaults to its own size). */
  box?: number;
  scale?: number;
}) {
  if (sprite === null) return null;
  const width = sprite.frameWidth * scale;
  const height = sprite.frameHeight * scale;
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center"
      style={{ width: box ?? width, height: box ?? height }}
    >
      <span className="block overflow-hidden" style={{ width, height }}>
        <span
          className="block"
          style={{
            width: sprite.frameWidth,
            height: sprite.frameHeight,
            backgroundImage: `url(${sprite.sheetUrl})`,
            backgroundPosition: `-${sprite.frameX}px -${sprite.frameY}px`,
            backgroundRepeat: "no-repeat",
            imageRendering: "pixelated",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </span>
    </span>
  );
}
