/**
 * Claim Victory resolution (`claim_victory`, §4.4, §9; `timeout_claim_rules`).
 *
 * The inactive opponent claims a win after the active player's turn deadline has
 * passed. The engine owns only the **completion** — winner = claimant, reason
 * `timeout_claimed`, events `victory_claimed` + `match_completed`. The **clock**
 * gate (`deadline_must_be_expired`, `late_player_must_not_have_committed_valid_
 * action_after_expiration`) lives in the backend, which owns the wall clock; the
 * engine only asserts the clock-free preconditions (via `validate.ts`) that the
 * claimant is the inactive player of an active match. Draws no randomness; the
 * completion timestamp is stamped by the backend.
 *
 * @see docs/01-specification/game-specification.md §4.4, §9, §23.1
 * @see docs/02-data/rules.yaml → timeout_claim_rules
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T1)
 */

import type { ClaimVictoryAction } from "./actions";
import { updateMatch } from "./board";
import type { EngineResult } from "./engine";
import type { Event } from "./events";
import type { MatchState } from "./state";

/**
 * Resolve a validated `claim_victory`: the claimant wins, the timed-out active
 * player loses, the match completes.
 */
export function applyClaimVictory(
  state: MatchState,
  action: ClaimVictoryAction,
): EngineResult {
  const timedOutPlayerId = state.match.activePlayerId;

  const next = updateMatch(state, {
    status: "completed",
    winnerPlayerId: action.playerId,
    completionReason: "timeout_claimed",
  });

  const events: Event[] = [
    {
      type: "victory_claimed",
      playerId: action.playerId,
      timedOutPlayerId,
    },
    {
      type: "match_completed",
      winnerPlayerId: action.playerId,
      reason: "timeout_claimed",
    },
  ];
  return { nextState: next, events };
}
