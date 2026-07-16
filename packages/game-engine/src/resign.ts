/**
 * Resignation (`resign`, §4.5; `rules.yaml` → resignation).
 *
 * The active player concedes: the engine marks them resigned and completes the
 * match immediately in the opponent's favour with reason `resignation`, emitting
 * `player_resigned` + `match_completed`. Legality (active player, active match) is
 * the shared turn precondition in `validate.ts`; this module owns only the
 * resolution. Draws no randomness; the completion timestamp is stamped by the
 * backend, not the engine.
 *
 * @see docs/01-specification/game-specification.md §4.5, §23
 * @see docs/04-development/milestones/m7-actions.md (M7-T5)
 */

import type { ResignAction } from "./actions";
import { updateMatch, updatePlayer } from "./board";
import type { EngineResult } from "./engine";
import type { Event } from "./events";
import type { MatchState } from "./state";

/**
 * Resolve a validated `resign`: the resigning player loses, the opponent wins.
 *
 * @throws {Error} if the two-player match has no opponent — an invariant
 *   violation, since the pipeline validates the action before applying it.
 */
export function applyResign(
  state: MatchState,
  action: ResignAction,
): EngineResult {
  const opponent = state.players.find((p) => p.playerId !== action.playerId);
  if (opponent === undefined) {
    throw new Error(`applyResign: no opponent for ${action.playerId}`);
  }

  let next = updatePlayer(state, action.playerId, { resigned: true });
  next = updateMatch(next, {
    status: "completed",
    winnerPlayerId: opponent.playerId,
    completionReason: "resignation",
  });

  const events: Event[] = [
    { type: "player_resigned", playerId: action.playerId },
    {
      type: "match_completed",
      winnerPlayerId: opponent.playerId,
      reason: "resignation",
    },
  ];
  return { nextState: next, events };
}
