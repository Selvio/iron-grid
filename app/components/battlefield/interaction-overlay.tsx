"use client";

import { useRef } from "react";

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
 * The grid is a **roving tabindex**: exactly one cell is tabbable and the arrow
 * keys move between them. That is the accessible pattern for a grid — 150 tab
 * stops is not a board, it is a wall — and it doubles as the Advance-Wars
 * cursor, since focus and cursor become the same thing.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T5)
 * @see docs/03-architecture/frontend.md §10
 */

/** Display size of one tile at the default desktop art scale (16px × 3). */
export const TILE_DISPLAY_PX = 48;

type Tile = { readonly x: number; readonly y: number };

/**
 * The Advance-Wars cursor: four corner brackets around the tile. The browser's
 * focus ring is suppressed in its favour — a rounded outline over pixel art
 * reads as a web widget, and the brackets are legible over any terrain because
 * they carry their own dark edge.
 */
function TileCursor() {
  const corner =
    "absolute size-[30%] border-[3px] border-white [filter:drop-shadow(0_0_1px_rgba(0,0,0,0.9))]";
  return (
    <span
      aria-hidden
      data-cursor="true"
      className="pointer-events-none absolute inset-0"
    >
      <span className={`${corner} left-0 top-0 border-b-0 border-r-0`} />
      <span className={`${corner} right-0 top-0 border-b-0 border-l-0`} />
      <span className={`${corner} bottom-0 left-0 border-r-0 border-t-0`} />
      <span className={`${corner} bottom-0 right-0 border-l-0 border-t-0`} />
    </span>
  );
}

export function InteractionOverlay({
  width,
  height,
  tilePx = TILE_DISPLAY_PX,
  reachable,
  attackRange = [],
  targets = [],
  reticles = [],
  path = [],
  cursor = null,
  onTileClick,
  onTileHover,
  onArrowKey,
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
  /** The tile holding the keyboard cursor — the grid's single tab stop. */
  cursor?: Tile | null;
  onTileClick: (x: number, y: number) => void;
  /** Called for both pointer hover and keyboard focus: they mean the same thing. */
  onTileHover?: (x: number, y: number) => void;
  /**
   * Gives the controller first refusal on an arrow key. Returning true means it
   * handled the press (cycling attack targets, say) and the cursor stays put.
   */
  onArrowKey?: (dx: number, dy: number) => boolean;
}) {
  const grid = useRef<HTMLDivElement>(null);
  // The cursor falls back to the first tile so the grid always has a tab stop.
  const cursorX = cursor?.x ?? 0;
  const cursorY = cursor?.y ?? 0;

  /** Move the cursor by one tile, clamped to the board, and take focus with it. */
  function moveCursor(dx: number, dy: number): void {
    const x = Math.min(width - 1, Math.max(0, cursorX + dx));
    const y = Math.min(height - 1, Math.max(0, cursorY + dy));
    if (x === cursorX && y === cursorY) return;
    // Focus directly rather than through an effect: only a key press should
    // move focus, never a re-render caused by the mouse.
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-x="${x}"][data-y="${y}"]`)
      ?.focus();
    onTileHover?.(x, y);
  }

  function onGridKeyDown(event: React.KeyboardEvent): void {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = step[event.key];
    if (delta === undefined) return;
    event.preventDefault(); // arrows would otherwise scroll the board
    if (onArrowKey?.(delta[0], delta[1]) === true) return;
    moveCursor(delta[0], delta[1]);
  }
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
      const isCursor = x === cursorX && y === cursorY;
      cells.push(
        <button
          key={`${x},${y}`}
          type="button"
          data-x={x}
          data-y={y}
          aria-label={`Tile ${x}, ${y}`}
          tabIndex={isCursor ? 0 : -1}
          onClick={() => onTileClick(x, y)}
          onMouseEnter={() => onTileHover?.(x, y)}
          onFocus={() => onTileHover?.(x, y)}
          onKeyDown={(event) => {
            // Space is the range toggle everywhere on the board; letting it also
            // activate whichever tile has focus would fire two actions at once.
            if (event.key === " ") event.preventDefault();
          }}
          data-in-range={highlighted ? "true" : undefined}
          data-attack-range={isThreatened ? "true" : undefined}
          className={cn(
            "relative border border-transparent outline-none transition-colors",
            highlighted && "hover:bg-primary/20",
            isTarget &&
              "border-destructive bg-destructive/40 hover:bg-destructive/50",
          )}
        >
          {isCursor && <TileCursor />}
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
        ref={grid}
        role="grid"
        aria-label="Battlefield tiles"
        onKeyDown={onGridKeyDown}
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${width}, ${tilePx}px)`,
          gridTemplateRows: `repeat(${height}, ${tilePx}px)`,
        }}
      >
        {cells}
      </div>
      {path.length >= 2 && <PathArrow path={path} tilePx={tilePx} />}
    </div>
  );
}

/**
 * The Advance-Wars move arrow: a thick solid shaft with a black outline and a
 * broad triangular head, not a hairline with a marker. It is built from two
 * passes of the same geometry — the outline underneath, the fill on top — which
 * is what gives the chunky sprite look at any zoom.
 */
function PathArrow({
  path,
  tilePx,
}: {
  path: readonly Tile[];
  tilePx: number;
}) {
  const center = (n: number): number => n * tilePx + tilePx / 2;
  const last = path[path.length - 1]!;
  const previous = path[path.length - 2]!;
  const dx = Math.sign(last.x - previous.x);
  const dy = Math.sign(last.y - previous.y);
  const headLength = tilePx * 0.44;
  const headHalfWidth = tilePx * 0.34;
  const shaft = tilePx * 0.3;
  const outline = Math.max(2, Math.round(tilePx * 0.09));

  // The shaft stops where the head begins so the two do not overlap.
  const tip = { x: center(last.x), y: center(last.y) };
  const base = { x: tip.x - dx * headLength, y: tip.y - dy * headLength };
  const points = path
    .slice(0, -1)
    .map((c) => `${center(c.x)},${center(c.y)}`)
    .concat(`${base.x},${base.y}`)
    .join(" ");
  // Perpendicular to the final heading, for the head's two back corners.
  const head = [
    `${tip.x},${tip.y}`,
    `${base.x - dy * headHalfWidth},${base.y - dx * headHalfWidth}`,
    `${base.x + dy * headHalfWidth},${base.y + dx * headHalfWidth}`,
  ].join(" ");

  return (
    <svg
      aria-hidden
      data-path
      className="pointer-events-none absolute inset-0 overflow-visible"
    >
      <g
        fill="none"
        stroke="#12161f"
        strokeWidth={shaft + outline * 2}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      >
        <polyline points={points} />
      </g>
      <polygon
        points={head}
        fill="#12161f"
        stroke="#12161f"
        strokeWidth={outline * 2}
        strokeLinejoin="miter"
      />
      <g
        fill="none"
        stroke="#d63b2f"
        strokeWidth={shaft}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      >
        <polyline points={points} />
      </g>
      <polygon points={head} fill="#d63b2f" />
    </svg>
  );
}
