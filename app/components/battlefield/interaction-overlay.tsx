"use client";

import { cn } from "@/app/lib/utils";

/**
 * Interaction overlay (M10-T5/T6).
 *
 * The DOM grid that sits over the Phaser canvas (`design-reference.md` §6: range,
 * path and tooltips are DOM overlays over the board). It renders one cell per
 * tile, highlights the movement range (blue) and attackable targets (red), draws
 * the Advance-Wars move **path arrow** and the target **reticle**, reports tile
 * clicks and hovers up to the interaction controller. Being DOM, the whole
 * interaction surface is testable in jsdom — the canvas beneath is not. Pixel
 * alignment with the canvas is tuned visually in M12.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T5)
 */

/** Display size of one tile at the default desktop art scale (24px × 2). */
export const TILE_DISPLAY_PX = 48;

type Tile = { readonly x: number; readonly y: number };

export function InteractionOverlay({
  width,
  height,
  tilePx = TILE_DISPLAY_PX,
  reachable,
  targets = [],
  reticles = [],
  path = [],
  onTileClick,
  onTileHover,
}: {
  width: number;
  height: number;
  /** Display size of one tile in CSS px (must stay an integer for crisp pixels). */
  tilePx?: number;
  reachable: readonly Tile[];
  /** Tiles holding an attackable enemy (highlighted red during target select). */
  targets?: readonly Tile[];
  /** Tiles to draw the target reticle over (the enemy being aimed at). */
  reticles?: readonly Tile[];
  /** The move path to draw as an arrow (origin → hovered destination). */
  path?: readonly Tile[];
  onTileClick: (x: number, y: number) => void;
  onTileHover?: (x: number, y: number) => void;
}) {
  const center = (n: number): number => n * tilePx + tilePx / 2;
  const inRange = new Set(reachable.map((c) => `${c.x},${c.y}`));
  const targetable = new Set(targets.map((c) => `${c.x},${c.y}`));
  const aimed = new Set(reticles.map((c) => `${c.x},${c.y}`));
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const highlighted = inRange.has(`${x},${y}`);
      const isTarget = targetable.has(`${x},${y}`);
      const isAimed = aimed.has(`${x},${y}`);
      cells.push(
        <button
          key={`${x},${y}`}
          type="button"
          data-x={x}
          data-y={y}
          aria-label={`Tile ${x}, ${y}`}
          onClick={() => onTileClick(x, y)}
          onMouseEnter={() => onTileHover?.(x, y)}
          className={cn(
            "relative border border-transparent transition-colors",
            highlighted && "bg-primary/30 hover:bg-primary/40",
            isTarget &&
              "border-destructive bg-destructive/40 hover:bg-destructive/50",
          )}
        >
          {isAimed && (
            <span
              aria-hidden
              data-reticle="true"
              className="pointer-events-none absolute inset-[15%] rounded-full border-2 border-yellow-300 shadow-[0_0_0_2px_rgba(0,0,0,0.55)] ring-2 ring-yellow-300/40"
            />
          )}
        </button>,
      );
    }
  }

  return (
    <div className="relative">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${width}, ${tilePx}px)`,
          gridTemplateRows: `repeat(${height}, ${tilePx}px)`,
        }}
      >
        {cells}
      </div>
      {path.length >= 2 && (
        <svg
          aria-hidden
          data-path
          className="pointer-events-none absolute inset-0"
          width={width * tilePx}
          height={height * tilePx}
        >
          <defs>
            <marker
              id="ig-path-arrow"
              viewBox="0 0 10 10"
              refX="6.5"
              refY="5"
              markerWidth="3.6"
              markerHeight="3.6"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0.5,1 L9,5 L0.5,9 Z" className="fill-primary" />
            </marker>
          </defs>
          <g opacity={0.85}>
            <polyline
              points={path
                .map((c) => `${center(c.x)},${center(c.y)}`)
                .join(" ")}
              fill="none"
              className="stroke-primary"
              strokeWidth={Math.max(2, Math.round(tilePx / 8))}
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd="url(#ig-path-arrow)"
            />
          </g>
        </svg>
      )}
    </div>
  );
}
