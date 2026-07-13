/**
 * `applyAction` — apply a validated action, returning the next state and the
 * authoritative events (`rules.yaml` → `action_processing`, engine-owned steps).
 *
 * The engine owns three of the transaction's steps: check legality, apply the
 * state change, and create the authoritative events. It re-validates first and
 * throws on an illegal action so a failed check can never partially commit
 * (§ failure block, §6.5). Authentication, authorization, the expected-state-
 * version guard, event projection and persistence are backend concerns (M7).
 *
 * M2 draws no randomness — the `RandomSource` is accepted for signature
 * stability and first consumed by M3 combat luck.
 *
 * @see docs/02-data/rules.yaml → action_processing, turn_sequence.end_turn
 * @see docs/01-specification/game-specification.md §10.4, §11
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T4)
 */

import type { GameData } from "game-data";

import type { EndTurnAction, MoveAndWaitAction, Action } from "./actions";
import { replaceUnit, unitById, updateMatch } from "./board";
import type { EngineResult } from "./engine";
import type { Event } from "./events";
import { validateMovementPath } from "./movement";
import type { RandomSource } from "./random";
import { resolveStartOfTurn } from "./start-of-turn";
import type { Id, MatchState, UnitState } from "./state";
import { validateAction } from "./validate";

/** Apply `move_and_wait`: move the unit, spend one fuel per tile, mark it acted (§10). */
function applyMoveAndWait(
  state: MatchState,
  action: MoveAndWaitAction,
  gameData: GameData,
): EngineResult {
  // Present and legal by the preceding validation.
  const unit = unitById(state, action.unitId) as UnitState;
  const path = validateMovementPath(
    state,
    action.unitId,
    action.path,
    gameData,
  );

  const destination = action.path[action.path.length - 1] ?? unit.position;
  const fuelSpent = path.fuelCost; // one per traversed tile (§10.3)
  const fuelAfter = unit.fuel - fuelSpent;

  const moved: UnitState = {
    ...unit,
    position: destination,
    fuel: fuelAfter,
    hasActed: true,
  };
  const nextState = replaceUnit(state, moved);
  const events: Event[] = [
    {
      type: "unit_moved",
      unitId: unit.id,
      path: action.path,
      fuelSpent,
      fuelAfter,
    },
  ];
  return { nextState, events };
}

/** The next player in match order, wrapping around (`select_next_player`). */
function selectNextPlayer(state: MatchState): Id {
  const players = state.players;
  const index = players.findIndex(
    (p) => p.playerId === state.match.activePlayerId,
  );
  const next = players[(index + 1) % players.length];
  if (next === undefined) {
    throw new Error("applyAction: match has no players to pass the turn to");
  }
  return next.playerId;
}

/**
 * Apply `end_turn` (`turn_sequence.end_turn.ordered_steps`): emit `turn_ended`,
 * clear the current turn's expired claim, select the next player, then resolve
 * that player's start-of-turn (M2-T2). Its events follow `turn_ended` in order.
 */
function applyEndTurn(
  state: MatchState,
  action: EndTurnAction,
  gameData: GameData,
): EngineResult {
  const events: Event[] = [{ type: "turn_ended", playerId: action.playerId }];

  let next = updateMatch(state, { expiredTurnClaimAvailableTo: null });
  next = updateMatch(next, { activePlayerId: selectNextPlayer(next) });

  const resolved = resolveStartOfTurn(next, gameData);
  return {
    nextState: resolved.nextState,
    events: [...events, ...resolved.events],
  };
}

/**
 * Apply a validated `action` and return the next state and its events.
 *
 * @throws {Error} if the action is illegal — enforcing that a failed validation
 *   commits nothing (no partial state change).
 */
export function applyAction(
  state: MatchState,
  action: Action,
  gameData: GameData,
  random: RandomSource,
): EngineResult {
  void random; // M2 actions draw no randomness

  const validation = validateAction(state, action, gameData);
  if (!validation.valid) {
    const codes = validation.errors.map((e) => e.code).join(", ");
    throw new Error(
      `applyAction: refusing to apply illegal ${action.type} (${codes})`,
    );
  }

  switch (action.type) {
    case "move_and_wait":
      return applyMoveAndWait(state, action, gameData);
    case "end_turn":
      return applyEndTurn(state, action, gameData);
    default:
      // Unreachable: validateAction rejects every other type in M2.
      throw new Error(`applyAction: "${action.type}" is not resolvable in M2`);
  }
}
