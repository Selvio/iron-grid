/**
 * Resolved events the engine emits (`rules.yaml` → state_model.replay_event, §24).
 *
 * Events are the append-only replay substrate: each carries fully resolved data
 * sufficient to replay without recomputation (§24.5). `Event` is a discriminated
 * union on `type`; the events M2 emits are fully typed and the rest are declared
 * with an opaque payload, gaining real variants as their systems land in M3.
 *
 * @see docs/02-data/rules.yaml → enums.event_types
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T1)
 */

import type { EventType } from "./enums";
import type { Coordinate, Id } from "./state";

/** A new turn began for the active player (`turn_started`). */
export interface TurnStartedEvent {
  readonly type: "turn_started";
  readonly playerId: Id;
  readonly day: number;
}

/** Property income was granted at start of turn (`income_granted`, §6.2). */
export interface IncomeGrantedEvent {
  readonly type: "income_granted";
  readonly playerId: Id;
  readonly amount: number;
  readonly fundsAfter: number;
}

/** Daily fuel was consumed by a unit at start of turn (`fuel_consumed`, §17.2). */
export interface FuelConsumedEvent {
  readonly type: "fuel_consumed";
  readonly unitId: Id;
  readonly amount: number;
  readonly fuelAfter: number;
}

/** A unit was destroyed (`unit_destroyed`) — e.g. unpaid daily fuel (§17.3). */
export interface UnitDestroyedEvent {
  readonly type: "unit_destroyed";
  readonly unitId: Id;
  readonly reason: "daily_fuel" | "combat" | "cargo" | "silo";
}

/** Resolved combat luck, persisted so replay never rerolls (§12.6). */
export interface ResolvedLuck {
  readonly goodLuck: number;
  readonly badLuck: number;
}

/** An attacker struck a defender (`unit_attacked`, §12). */
export interface UnitAttackedEvent {
  readonly type: "unit_attacked";
  readonly attackerUnitId: Id;
  readonly defenderUnitId: Id;
  /** The `weapons.yaml` id of the weapon combat auto-selected (§12.2). */
  readonly weaponId: Id;
  /** The luck drawn from `combat_luck`, persisted for replay (§12.6). */
  readonly luck: ResolvedLuck;
  readonly damage: number;
  /** Defender true HP after the hit (0 when destroyed). */
  readonly defenderHpAfter: number;
}

/** A surviving direct defender struck back (`unit_counterattacked`, §12.8). */
export interface UnitCounterattackedEvent {
  readonly type: "unit_counterattacked";
  /** The original defender, now counterattacking. */
  readonly attackerUnitId: Id;
  /** The original attacker, now defending. */
  readonly defenderUnitId: Id;
  readonly weaponId: Id;
  /** The luck drawn from `combat_counter_luck`, persisted for replay (§12.6). */
  readonly luck: ResolvedLuck;
  readonly damage: number;
  readonly defenderHpAfter: number;
}

/** Cargo destroyed together with its transport (`cargo_destroyed`, §16.4). */
export interface CargoDestroyedEvent {
  readonly type: "cargo_destroyed";
  readonly unitId: Id;
  readonly transportUnitId: Id;
}

/** A fresh capture began on a property (`capture_started`, §13.3). */
export interface CaptureStartedEvent {
  readonly type: "capture_started";
  readonly unitId: Id;
  readonly propertyId: Id;
}

/** A capture advanced but did not complete (`capture_progressed`, §13.3). */
export interface CaptureProgressedEvent {
  readonly type: "capture_progressed";
  readonly unitId: Id;
  readonly propertyId: Id;
  /** Capture points still remaining after this action (1–19). */
  readonly pointsRemaining: number;
}

/** A property changed ownership on capture completion (`property_captured`, §13.5). */
export interface PropertyCapturedEvent {
  readonly type: "property_captured";
  readonly unitId: Id;
  readonly propertyId: Id;
  readonly newOwnerPlayerId: Id;
}

/** A unit was produced at a property (`unit_produced`, §6.4). */
export interface UnitProducedEvent {
  readonly type: "unit_produced";
  readonly unitId: Id;
  readonly unitTypeId: Id;
  readonly propertyId: Id;
  readonly ownerPlayerId: Id;
  /** Owner funds after the cost was deducted. */
  readonly fundsAfter: number;
}

/** A unit moved along a resolved path (`unit_moved`, §10). */
export interface UnitMovedEvent {
  readonly type: "unit_moved";
  readonly unitId: Id;
  /** The resolved path actually traversed, including the start tile. */
  readonly path: readonly Coordinate[];
  readonly fuelSpent: number;
  readonly fuelAfter: number;
}

/** The active player ended their turn (`turn_ended`). */
export interface TurnEndedEvent {
  readonly type: "turn_ended";
  readonly playerId: Id;
}

/**
 * Placeholder for the events emitted by M3 systems (combat, capture, …). Kept in
 * the union so exhaustive handling is enforced; refined as each system lands.
 */
export interface FutureEvent {
  readonly type: Exclude<
    EventType,
    | "turn_started"
    | "income_granted"
    | "fuel_consumed"
    | "unit_destroyed"
    | "unit_moved"
    | "turn_ended"
    | "unit_attacked"
    | "unit_counterattacked"
    | "cargo_destroyed"
    | "capture_started"
    | "capture_progressed"
    | "property_captured"
    | "unit_produced"
  >;
  readonly payload?: unknown;
}

/** Any resolved event the engine may emit. */
export type Event =
  | TurnStartedEvent
  | IncomeGrantedEvent
  | FuelConsumedEvent
  | UnitDestroyedEvent
  | UnitAttackedEvent
  | UnitCounterattackedEvent
  | CargoDestroyedEvent
  | CaptureStartedEvent
  | CaptureProgressedEvent
  | PropertyCapturedEvent
  | UnitProducedEvent
  | UnitMovedEvent
  | TurnEndedEvent
  | FutureEvent;
