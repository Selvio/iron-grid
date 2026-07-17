"use client";

import { cn } from "@/app/lib/utils";

/**
 * Interaction overlay (M10-T5).
 *
 * The DOM grid that sits over the Phaser canvas (`design-reference.md` §6: range,
 * path and tooltips are DOM overlays over the board). It renders one cell per
 * tile, highlights the movement range, and reports tile clicks up to the
 * interaction controller. Being DOM, the whole interaction surface is testable
 * in jsdom — the canvas beneath is not. Pixel alignment with the canvas is tuned
 * visually in M12.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T5)
 */

/** Display size of one tile (24px source × 2 desktop scale, `frontend.md` §4). */
export const TILE_DISPLAY_PX = 48;

export function InteractionOverlay({
  width,
  height,
  reachable,
  onTileClick,
}: {
  width: number;
  height: number;
  reachable: readonly { readonly x: number; readonly y: number }[];
  onTileClick: (x: number, y: number) => void;
}) {
  const inRange = new Set(reachable.map((c) => `${c.x},${c.y}`));
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const highlighted = inRange.has(`${x},${y}`);
      cells.push(
        <button
          key={`${x},${y}`}
          type="button"
          data-x={x}
          data-y={y}
          aria-label={`Tile ${x}, ${y}`}
          onClick={() => onTileClick(x, y)}
          className={cn(
            "border border-transparent transition-colors",
            highlighted && "bg-primary/30 hover:bg-primary/40",
          )}
        />,
      );
    }
  }

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${width}, ${TILE_DISPLAY_PX}px)`,
        gridTemplateRows: `repeat(${height}, ${TILE_DISPLAY_PX}px)`,
      }}
    >
      {cells}
    </div>
  );
}
