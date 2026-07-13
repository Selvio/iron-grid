/**
 * `calculateLegalActions` — enumerate the actions the active player may take
 * (`game-specification.md` §11, §27.2, `rules.yaml` → `action_processing`).
 *
 * M2 scope: for each of the active player's not-yet-acted, board-present units, a
 * single `move_and_wait` action carrying its legal destinations — the reachable
 * tiles (M2-T3) plus the unit's own tile, since waiting in place is always legal
 * (§11 `wait`). Plus one `end_turn`. The structure is deliberately per-unit and
 * additive so M3 extends it with attack/capture/produce/… without a rewrite.
 *
 * Only the active player of an active match has actions; anyone else gets an
 * empty list. Units and destinations are emitted in canonical board order so the
 * enumeration is deterministic for replays and tests.
 *
 * @see docs/01-specification/game-specification.md §11, §27.2
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T5)
 */

import type { GameData } from "game-data";

import { compareBoardOrder } from "./board";
import type { LegalAction } from "./engine";
import { calculateMovementRange } from "./movement";
import type { Coordinate, Id, MatchState } from "./state";

/** Order coordinates canonically (`y asc, x asc`) for deterministic output. */
function byBoardOrder(a: Coordinate, b: Coordinate): number {
  return a.y - b.y || a.x - b.x;
}

/**
 * The legal actions available to `playerId` in the current state (M2 scope:
 * `move_and_wait` per idle unit, and `end_turn`).
 */
export function calculateLegalActions(
  state: MatchState,
  playerId: Id,
  gameData: GameData,
): readonly LegalAction[] {
  if (
    state.match.status !== "active" ||
    state.match.activePlayerId !== playerId
  ) {
    return [];
  }

  const actions: LegalAction[] = [];
  const idleUnits = state.units
    .filter(
      (u) => u.ownerPlayerId === playerId && u.position !== null && !u.hasActed,
    )
    .slice()
    .sort(compareBoardOrder);

  for (const unit of idleUnits) {
    const origin = unit.position;
    if (origin === null) continue; // narrowed already, but keep TS honest
    const { reachable } = calculateMovementRange(state, unit.id, gameData);
    // Waiting in place is a zero-length move_and_wait, so the origin is a
    // destination alongside every reachable tile.
    const destinations = [origin, ...reachable].sort(byBoardOrder);
    actions.push({ type: "move_and_wait", unitId: unit.id, destinations });
  }

  actions.push({ type: "end_turn" });
  return actions;
}
