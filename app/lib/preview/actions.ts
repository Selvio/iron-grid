import {
  calculateCombatPreview,
  calculateLegalActions,
  type ActionType,
  type CombatPreview,
} from "game-engine";
import type { GameData } from "game-data";

import type { MatchView } from "@/app/lib/api-client";

import { matchViewToState } from "./match-state-adapter";

/**
 * In-browser legal-action and combat previews (M10-T6).
 *
 * Non-authoritative wrappers over the same pure engine functions the server uses
 * (`frontend.md` §6; `game-specification.md` §11, §12.7). `previewUnitActions`
 * lists the action types available to a unit this turn (the action menu);
 * `previewCombat` returns the min/max damage + counter forecast (no luck drawn).
 * Advisory only — the server re-validates on submit and the client discards the
 * preview in favor of the returned event on any disagreement.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T6)
 */

/** The action types the given unit can take this turn (for the action menu). */
export function previewUnitActions(
  view: MatchView,
  unitId: string,
  gameData: GameData,
): readonly ActionType[] {
  const legal = calculateLegalActions(
    matchViewToState(view),
    view.viewerPlayerId,
    gameData,
  );
  const types = new Set<ActionType>();
  for (const action of legal) {
    if (action.unitId === unitId) types.add(action.type);
  }
  return [...types];
}

/** The min/max damage (+ counter) forecast for an attack, no luck drawn. */
export function previewCombat(
  view: MatchView,
  attackerUnitId: string,
  targetUnitId: string,
  gameData: GameData,
): CombatPreview {
  return calculateCombatPreview(
    matchViewToState(view),
    {
      type: "attack",
      matchId: view.matchId,
      playerId: view.viewerPlayerId,
      unitId: attackerUnitId,
      targetUnitId,
      expectedStateVersion: view.stateVersion,
      idempotencyKey: "preview",
    },
    gameData,
  );
}
