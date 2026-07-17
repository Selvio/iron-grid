import {
  calculateMovementRange,
  type Coordinate,
  type MovementRange,
} from "game-engine";
import type { GameData } from "game-data";

import type { MatchView } from "@/app/lib/api-client";

import { matchViewToState } from "./match-state-adapter";

/**
 * In-browser movement-range preview (M10-T5).
 *
 * A thin, non-authoritative wrapper: it adapts the projected `MatchView` into an
 * engine state and runs the **same** pure `calculateMovementRange` the server
 * uses (`frontend.md` §6). Advisory only — the server re-validates on submit.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T5)
 */
export function previewMovementRange(
  view: MatchView,
  unitId: string,
  gameData: GameData,
): readonly Coordinate[] {
  const range: MovementRange = calculateMovementRange(
    matchViewToState(view),
    unitId,
    gameData,
  );
  return range.reachable;
}
