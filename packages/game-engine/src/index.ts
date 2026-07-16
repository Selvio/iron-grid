/**
 * `game-engine` — the pure, deterministic, framework-free core of Iron Grid.
 *
 * Every function is pure over `(state, …, gameData[, randomSource])`: no I/O, no
 * wall-clock access, and randomness only from an injected source
 * (`rules.yaml` → engine_contract). Framework dependencies are forbidden and
 * enforced by a guard (see `forbidden-deps.test.ts`).
 *
 * Public surface: the immutable runtime state model, the action/event unions,
 * the injected randomness contract, board helpers, and the nine contract
 * functions. M2 implements start-of-turn, movement, legal actions and the
 * move/end-turn transitions; projection/visibility/combat/victory land in M3.
 *
 * @see docs/02-data/rules.yaml → engine_contract
 * @see docs/03-architecture/architecture.md §4 (the pure engine)
 * @see docs/04-development/milestones/m2-engine-core.md (M2)
 */

export type {
  ActionType,
  CompletionReason,
  EventType,
  MatchStatus,
  ValidationErrorCode,
} from "./enums";
export type {
  Coordinate,
  Id,
  MatchMeta,
  MatchState,
  PlayerState,
  PropertyState,
  SpecialState,
  TerrainObjectState,
  Timestamp,
  UnitState,
} from "./state";
export type {
  Action,
  ActionEnvelope,
  ActivatePowerAction,
  AttackAction,
  CaptureAction,
  DiveAction,
  EndTurnAction,
  FutureAction,
  JoinAction,
  LoadAction,
  MoveAndWaitAction,
  ProduceAction,
  SupplyAction,
  SurfaceAction,
  UnloadAction,
  UnloadTarget,
} from "./actions";
export type {
  CaptureProgressedEvent,
  CaptureStartedEvent,
  CargoDestroyedEvent,
  Event,
  FuelConsumedEvent,
  FutureEvent,
  IncomeGrantedEvent,
  MatchCompletedEvent,
  PowerActivatedEvent,
  PropertyCapturedEvent,
  ResolvedLuck,
  SubmarineDivedEvent,
  SubmarineSurfacedEvent,
  TurnEndedEvent,
  TurnStartedEvent,
  UnitAttackedEvent,
  UnitBlockedByFogEvent,
  UnitCounterattackedEvent,
  UnitDestroyedEvent,
  UnitLoadedEvent,
  UnitMovedEvent,
  UnitProducedEvent,
  UnitRepairedEvent,
  UnitResuppliedEvent,
  UnitsJoinedEvent,
  UnitSuppliedEvent,
  UnitUnloadedEvent,
} from "./events";
export type { RandomSource, RandomStream } from "./random";

export { ownerModifier } from "./commanders";
export type { ModifierTarget } from "./commanders";

export {
  addUnit,
  compareBoardOrder,
  displayHp,
  playerById,
  propertyAt,
  propertyById,
  removeUnit,
  replaceProperty,
  replaceUnit,
  sameCoordinate,
  unitAt,
  unitById,
  updateMatch,
  updatePlayer,
} from "./board";

export {
  applyAction,
  calculateCombatPreview,
  calculateLegalActions,
  calculateMovementRange,
  calculateVisibility,
  destroyUnit,
  evaluateVictory,
  projectStateForPlayer,
  resolveStartOfTurn,
  validateAction,
  validateMovementPath,
} from "./engine";

export { createInitialMatchState } from "./setup";
export type { InitialMatchInput, RosterEntry } from "./setup";
export type {
  CombatPreview,
  DamageForecast,
  EngineResult,
  LegalAction,
  MovementPathResult,
  MovementRange,
  PlayerView,
  ValidationError,
  ValidationResult,
  Visibility,
  VictoryResult,
} from "./engine";
