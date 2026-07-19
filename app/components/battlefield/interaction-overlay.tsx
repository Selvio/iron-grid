"use client";

import { cn } from "@/app/lib/utils";

/**
 * Interaction overlay (M10-T5/T6).
 *
 * The DOM grid that sits over the Phaser canvas: one cell per tile, reporting
 * clicks and hovers to the interaction controller and drawing what belongs
 * *above* the pieces — the move **path arrow**, the target **reticle** and the
 * attackable-enemy markers.
 *
 * The move and attack ranges are painted by the scene instead, between the
 * board and the units (`create-game.ts`), because in Advance Wars a range
 * covers the ground and passes under the units standing on it — which a DOM
 * layer over the canvas cannot do. Each cell still carries the range state as
 * data attributes, so the interaction surface stays assertable in jsdom.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T5)
 */

/** Display size of one tile at the default desktop art scale (16px × 3). */
export const TILE_DISPLAY_PX = 48;

type Tile = { readonly x: number; readonly y: number };

export function InteractionOverlay({
  width,
  height,
  tilePx = TILE_DISPLAY_PX,
  reachable,
  attackRange = [],
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
  /** Tiles the selected unit could fire on (the Advance-Wars red hatch). */
  attackRange?: readonly Tile[];
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
  const threatened = new Set(attackRange.map((c) => `${c.x},${c.y}`));
  const targetable = new Set(targets.map((c) => `${c.x},${c.y}`));
  const aimed = new Set(reticles.map((c) => `${c.x},${c.y}`));
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const highlighted = inRange.has(`${x},${y}`);
      const isTarget = targetable.has(`${x},${y}`);
      const isAimed = aimed.has(`${x},${y}`);
      const isThreatened = threatened.has(`${x},${y}`);
      cells.push(
        <button
          key={`${x},${y}`}
          type="button"
          data-x={x}
          data-y={y}
          aria-label={`Tile ${x}, ${y}`}
          onClick={() => onTileClick(x, y)}
          onMouseEnter={() => onTileHover?.(x, y)}
          data-in-range={highlighted ? "true" : undefined}
          data-attack-range={isThreatened ? "true" : undefined}
          className={cn(
            "relative border border-transparent transition-colors",
            highlighted && "hover:bg-primary/20",
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
