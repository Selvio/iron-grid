import type { MatchState, PlayerState } from "game-engine";

import type { MatchView } from "@/app/lib/api-client";

/**
 * Projection → engine-state adapter for in-browser previews (M10-T5).
 *
 * The pure engine preview functions (`calculateMovementRange` /
 * `calculateLegalActions` / `calculateCombatPreview`) take a full `MatchState`,
 * but the client holds only a fog-projected `MatchView`. This rebuilds a
 * `MatchState`-shaped value sufficient for those previews from the projection —
 * the units and properties pass straight through (the projection already emits
 * `UnitState`/`PropertyState`), and the unknown, hidden fields (the opponent's
 * funds, the PRNG seed/index) are filled with **safe defaults**.
 *
 * The result is for **non-authoritative previews only** (`frontend.md` §6): it
 * invents no hidden state, and every preview built on it is advisory — the server
 * re-validates and the client discards the preview in favor of the returned
 * event on any disagreement. Previewing the viewer's own units never reads the
 * defaulted opponent economy, so movement/attack forecasts stay exact.
 *
 * @see docs/04-development/milestones/m10-battlefield.md (M10-T5)
 */
export function matchViewToState(view: MatchView): MatchState {
  const players: PlayerState[] = [];
  if (view.you) {
    players.push({
      playerId: view.you.playerId,
      userId: null,
      factionId: view.you.factionId,
      commanderId: view.you.commanderId,
      funds: view.you.funds,
      powerMeter: view.you.powerMeter,
      ready: true,
      resigned: view.you.resigned,
    });
  }
  if (view.opponent) {
    players.push({
      playerId: view.opponent.playerId,
      userId: null,
      factionId: view.opponent.factionId,
      commanderId: view.opponent.commanderId,
      funds: 0, // hidden by the projection; unused for own-unit previews
      powerMeter: 0,
      ready: true,
      resigned: view.opponent.resigned,
    });
  }

  return {
    match: {
      id: view.matchId,
      status: view.status,
      dataVersion: "",
      mapId: view.mapId,
      stateVersion: view.stateVersion,
      currentDay: view.currentDay,
      activePlayerId: view.activePlayerId,
      firstPlayerId: view.activePlayerId,
      startedAt: null,
      completedAt: null,
      winnerPlayerId: view.winnerPlayerId,
      completionReason: view.completionReason,
      turnDeadlineAt: view.turnDeadlineAt,
      expiredTurnClaimAvailableTo: null,
      deterministicSeed: "",
      randomSequenceIndex: 0,
    },
    players,
    units: view.units,
    properties: view.properties,
    terrainObjects: [],
  };
}
