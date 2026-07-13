/**
 * The nine public engine functions (`rules.yaml` → engine_contract.
 * required_public_functions) and their result types.
 *
 * Each is a pure function of its inputs (`(state, …, gameData[, random])`),
 * returning a new state and resolved events without mutating its input, reading
 * the clock, or performing I/O (`engine_contract.purity`). M2 implements
 * `resolveStartOfTurn`, `calculateMovementRange`, `calculateLegalActions`,
 * `validateAction` and `applyAction`; the projection/visibility/combat/victory
 * functions land in M3 and throw until then. `GameData` is imported **type-only**
 * so no runtime dependency is added and purity is preserved.
 *
 * @see docs/02-data/rules.yaml → engine_contract
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T1)
 */

import type { GameData } from "game-data";

import type { ActionType, ValidationErrorCode } from "./enums";
import type { Event } from "./events";
import type { Coordinate, Id, MatchState } from "./state";

export { applyAction } from "./apply";
export { calculateCombatPreview, destroyUnit } from "./combat";
export { calculateLegalActions } from "./legal-actions";
export { calculateMovementRange, validateMovementPath } from "./movement";
export type { MovementPathResult } from "./movement";
export { resolveStartOfTurn } from "./start-of-turn";
export { validateAction } from "./validate";

/** The result of a state transition: the next state and the events it produced. */
export interface EngineResult {
  readonly nextState: MatchState;
  readonly events: readonly Event[];
}

/** A single reason an action was rejected. */
export interface ValidationError {
  readonly code: ValidationErrorCode;
  readonly message?: string;
}

/** Whether an action is legal, and if not, why (aggregated). */
export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly errors: readonly ValidationError[] };

/** Reachable destinations for a unit (refined in M2-T3). */
export interface MovementRange {
  readonly unitId: Id;
  readonly reachable: readonly Coordinate[];
}

/** A legal action available to a player (refined in M2-T5). */
export interface LegalAction {
  readonly type: ActionType;
  readonly unitId?: Id;
  readonly destinations?: readonly Coordinate[];
}

/** The per-player projected read-model (`domain-model.md` §13). Built in M3. */
export interface PlayerView {
  readonly viewerPlayerId: Id;
}

/** Per-player visibility computation (§18). Built in M3. */
export interface Visibility {
  readonly playerId: Id;
  readonly visible: readonly Coordinate[];
}

/** A min/max damage forecast for one hit (`game-specification.md` §12.7). */
export interface DamageForecast {
  readonly minDamage: number;
  readonly maxDamage: number;
}

/** A non-authoritative combat forecast (§12.7): attacker damage and any counter. */
export interface CombatPreview {
  readonly attackerUnitId: Id;
  readonly defenderUnitId: Id;
  readonly minDamage: number;
  readonly maxDamage: number;
  /** Present only when a counterattack is structurally possible (§12.8). */
  readonly counter?: DamageForecast;
}

/** The outcome of a victory evaluation (§23). Built in M3. */
export interface VictoryResult {
  readonly completed: boolean;
}

/** Marks a function whose implementation lands in a later ticket. */
function notImplemented(ticket: string): never {
  throw new Error(`game-engine: not implemented until ${ticket}`);
}

/** Project state to what a player may observe (M3). */
export function projectStateForPlayer(
  state: MatchState,
  playerId: Id,
  gameData: GameData,
): PlayerView {
  void state;
  void playerId;
  void gameData;
  return notImplemented("M3");
}

/** Compute a player's visibility (M3). */
export function calculateVisibility(
  state: MatchState,
  playerId: Id,
  gameData: GameData,
): Visibility {
  void state;
  void playerId;
  void gameData;
  return notImplemented("M3");
}

/** Evaluate victory/defeat conditions (M3). */
export function evaluateVictory(
  state: MatchState,
  gameData: GameData,
): VictoryResult {
  void state;
  void gameData;
  return notImplemented("M3");
}
