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
import { replaceUnit, unitAt, unitById, updateMatch } from "./board";
import { applyCapture, clearCaptureBy } from "./capture";
import { applyAttack } from "./combat";
import { applyActivatePower } from "./commanders";
import { applyJoin } from "./join";
import { applyProduce } from "./production";
import { applyResign } from "./resign";
import { applyDive, applySurface } from "./submarine";
import { applySupply } from "./supply";
import { applyLoad, applyUnload } from "./transport";
import { finalizeVictory } from "./victory";
import { calculateVisibility } from "./visibility";
import type { EngineResult } from "./engine";
import type { Event } from "./events";
import type { RandomSource } from "./random";
import { resolveStartOfTurn } from "./start-of-turn";
import type { Coordinate, Id, MatchState, UnitState } from "./state";
import { validateAction } from "./validate";

/** Apply `move_and_wait`: move the unit, spend one fuel per tile, mark it acted (§10). */
function applyMoveAndWait(
  state: MatchState,
  action: MoveAndWaitAction,
  gameData: GameData,
): EngineResult {
  // Present and legal by the preceding validation.
  const unit = unitById(state, action.unitId) as UnitState;

  // Under fog, movement stops at the first tile before an unseen enemy; the
  // committed path is charged fuel through the stopping point (§18.5).
  const { path, blocked } = resolveFogCollision(
    state,
    unit,
    action.path,
    gameData,
  );

  const destination = path[path.length - 1] ?? unit.position;
  const fuelSpent = path.length - 1; // one per traversed tile (§10.3)
  const fuelAfter = unit.fuel - fuelSpent;

  const moved: UnitState = {
    ...unit,
    position: destination,
    fuel: fuelAfter,
    hasActed: true,
  };
  // A non-capture action interrupts any capture this unit was performing (§13.4).
  const nextState = clearCaptureBy(
    replaceUnit(state, moved),
    unit.id,
    gameData,
  );
  const events: Event[] = [
    {
      type: "unit_moved",
      unitId: unit.id,
      path,
      fuelSpent,
      fuelAfter,
    },
  ];
  if (blocked && destination !== null) {
    events.push({
      type: "unit_blocked_by_fog",
      unitId: unit.id,
      stoppedAt: destination,
    });
  }
  return { nextState, events };
}

/**
 * Truncate a fog move at the first tile occupied by an enemy the mover cannot
 * see (§18.5). Returns the committed path (unchanged when no fog or no collision)
 * and whether a collision stopped the move early.
 */
function resolveFogCollision(
  state: MatchState,
  unit: UnitState,
  path: readonly Coordinate[],
  gameData: GameData,
): { readonly path: readonly Coordinate[]; readonly blocked: boolean } {
  if (state.match.fogEnabled !== true) return { path, blocked: false };

  const visible = new Set(
    calculateVisibility(state, unit.ownerPlayerId, gameData).visible.map(
      (c) => `${c.x},${c.y}`,
    ),
  );
  for (let i = 1; i < path.length; i++) {
    const tile = path[i]!;
    const occupant = unitAt(state, tile);
    if (
      occupant !== undefined &&
      occupant.ownerPlayerId !== unit.ownerPlayerId &&
      !visible.has(`${tile.x},${tile.y}`)
    ) {
      return { path: path.slice(0, i), blocked: true }; // stop before the enemy
    }
  }
  return { path, blocked: false };
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
  const validation = validateAction(state, action, gameData);
  if (!validation.valid) {
    const codes = validation.errors.map((e) => e.code).join(", ");
    throw new Error(
      `applyAction: refusing to apply illegal ${action.type} (${codes})`,
    );
  }

  const result = dispatch(state, action, gameData, random);

  // Evaluate victory on the resolved end-of-action state (§23.2 timing). end_turn
  // already evaluated it inside resolveStartOfTurn, so this is then a no-op.
  const victory = finalizeVictory(result.nextState, gameData);
  return {
    nextState: victory.state,
    events: [...result.events, ...victory.events],
  };
}

/** Route a validated action to its handler (victory is evaluated by the caller). */
function dispatch(
  state: MatchState,
  action: Action,
  gameData: GameData,
  random: RandomSource,
): EngineResult {
  switch (action.type) {
    case "move_and_wait":
      // move_and_wait and end_turn draw no randomness; only combat does.
      return applyMoveAndWait(state, action, gameData);
    case "attack":
      return applyAttack(state, action, gameData, random);
    case "capture":
      return applyCapture(state, action, gameData);
    case "produce":
      return applyProduce(state, action, gameData);
    case "supply":
      return applySupply(state, action, gameData);
    case "join":
      return applyJoin(state, action, gameData);
    case "load":
      return applyLoad(state, action);
    case "unload":
      return applyUnload(state, action);
    case "dive":
      return applyDive(state, action);
    case "surface":
      return applySurface(state, action);
    case "activate_power":
      return applyActivatePower(state, action, gameData);
    case "end_turn":
      return applyEndTurn(state, action, gameData);
    case "resign":
      return applyResign(state, action);
    default:
      // Unreachable: validateAction rejects every other type not yet supported.
      throw new Error(`applyAction: "${action.type}" is not resolvable in M2`);
  }
}
