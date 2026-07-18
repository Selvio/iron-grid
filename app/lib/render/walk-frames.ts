import type { Coordinate } from "game-engine";

import type { UnitAnimation } from "./derive-render-data";

/**
 * Directional walk-frame selection for the move animation (M10 follow-up).
 *
 * A pure mapping from a path segment's direction to the sprite-sheet walk
 * animation + horizontal flip, so the Phaser scene can play the Advance-Wars-style
 * tile-by-tile walk. `move_side` serves both left and right (flipped for left);
 * world `+y` is screen-down. Framework-free and unit-tested.
 *
 * @see docs/04-development/milestones/m10-battlefield.md
 */

export type WalkDirection = "up" | "down" | "left" | "right";

/** The heading from one path tile to the next; horizontal wins diagonal ties. */
export function stepDirection(from: Coordinate, to: Coordinate): WalkDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "right" : "left";
  }
  return dy > 0 ? "down" : "up";
}

/** The walk animation + flip for a heading. */
export function walkFrameSpec(dir: WalkDirection): {
  readonly animation: UnitAnimation;
  readonly flipX: boolean;
} {
  switch (dir) {
    case "left":
      return { animation: "move_side", flipX: true };
    case "right":
      return { animation: "move_side", flipX: false };
    case "down":
      return { animation: "move_down", flipX: false };
    case "up":
      return { animation: "move_up", flipX: false };
  }
}
