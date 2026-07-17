/**
 * The immutable runtime state model, from `rules.yaml` → `state_model` and
 * `domain-model.md` §6–§12.
 *
 * These are *runtime* entities: they reference reference data (`GameData`) by
 * stable id and never copy its values (`domain-model.md` §2). Every field is
 * `readonly` — the engine produces a new `MatchState` via structural sharing and
 * never mutates its input (`engine_contract.purity`). Derived values (e.g.
 * `displayHp = ceil(trueHp / 10)`) are computed by helpers, never stored.
 *
 * @see docs/02-data/rules.yaml → state_model
 * @see docs/03-architecture/domain-model.md
 * @see docs/04-development/milestones/m2-engine-core.md (M2-T1)
 */

import type { CompletionReason, MatchStatus } from "./enums";

/** A stable, opaque identifier unique within its scope (`domain-model.md` §3). */
export type Id = string;

/**
 * A wall-clock instant (ISO 8601), stamped by the backend. **Opaque to the
 * engine** — the engine never reads the clock, it only carries these values
 * through (`domain-model.md` §15).
 */
export type Timestamp = string;

/** A logical grid cell, origin top-left, independent of render scale (§7.1). */
export interface Coordinate {
  readonly x: number;
  readonly y: number;
}

/** Submarine visibility/attack posture (`units.yaml` special_states, §19). */
export type SpecialState = "surfaced" | "submerged";

/** Match-level fields (`rules.yaml` → state_model.match). */
export interface MatchMeta {
  readonly id: Id;
  readonly status: MatchStatus;
  /** The `GameData` version pinned at activation; immutable for the match (§31.2). */
  readonly dataVersion: string;
  readonly mapId: Id;
  /** Monotonic, incremented by the backend on every applied action (§25). */
  readonly stateVersion: number;
  readonly currentDay: number;
  readonly activePlayerId: Id;
  readonly firstPlayerId: Id;
  readonly startedAt: Timestamp | null;
  readonly completedAt: Timestamp | null;
  readonly winnerPlayerId: Id | null;
  readonly completionReason: CompletionReason | null;
  readonly turnDeadlineAt: Timestamp | null;
  readonly expiredTurnClaimAvailableTo: Id | null;
  /**
   * When the active player last committed an action this turn (backend-stamped,
   * opaque to the engine). Null at turn start; a value **after** `turnDeadlineAt`
   * means the late player acted, revoking the deadline-expiry claim (§4.4).
   * Optional so pre-M8 snapshots and fixtures need not set it.
   */
  readonly lastActionAt?: Timestamp | null;
  /** Server-owned deterministic PRNG seed (`rules.yaml` → randomness). */
  readonly deterministicSeed: string;
  /** How many random draws have been taken; advanced only on committed draws. */
  readonly randomSequenceIndex: number;
  /**
   * Whether fog of war is enabled for this match (§18, host setting). Optional
   * and defaulting to off, so pre-fog callers and fixtures need not set it.
   */
  readonly fogEnabled?: boolean;
}

/** One participant's runtime state (`rules.yaml` → state_model.player_state). */
export interface PlayerState {
  readonly playerId: Id;
  readonly userId: Id | null;
  readonly factionId: string;
  readonly commanderId: string;
  /** Integer funds, never negative (§6.5). */
  readonly funds: number;
  /** Commander power charge (§22.5); charge formula is a design blocker (§33.1). */
  readonly powerMeter: number;
  readonly ready: boolean;
  readonly resigned: boolean;
}

/** A unit instance on the board (`rules.yaml` → state_model.unit_state, §9). */
export interface UnitState {
  readonly id: Id;
  /** Unit definition id in `units.yaml`. */
  readonly typeId: string;
  readonly ownerPlayerId: Id;
  /** Board position; `null` while loaded as cargo (§16). */
  readonly position: Coordinate | null;
  /** Internal health, 1–100; `displayHp` is derived, not stored (§9.2). */
  readonly trueHp: number;
  readonly fuel: number;
  readonly ammo: number;
  /** Whether the unit has ended its activation this owner turn (§10.5). */
  readonly hasActed: boolean;
  /** The property being captured, if a capture is in progress (§13). */
  readonly captureTargetPropertyId: Id | null;
  /** Loaded units carried by this unit (§16); ids, not board occupants. */
  readonly cargoUnitIds: readonly Id[];
  readonly specialState: SpecialState | null;
  /** The turn the unit was produced; it cannot act that turn (§6.4). */
  readonly createdTurn: number;
}

/** A placed property instance (`rules.yaml` → state_model.property_state, §10). */
export interface PropertyState {
  readonly id: Id;
  /** Property definition id in `properties.yaml`. */
  readonly typeId: string;
  readonly position: Coordinate;
  /** Owning player, or `null` when neutral. */
  readonly ownerPlayerId: Id | null;
  /** Remaining capture resistance, 0–20; starts at 20 (§13.3). */
  readonly capturePointsRemaining: number;
  /** The unit currently capturing this property, if any. */
  readonly capturingUnitId: Id | null;
}

/** A destructible terrain object, e.g. Pipe Seam (`state_model.terrain_object_state`, §21). */
export interface TerrainObjectState {
  readonly id: Id;
  /** Terrain definition id in `terrain.yaml`. */
  readonly terrainTypeId: string;
  readonly position: Coordinate;
  readonly trueHp: number;
  readonly state: string;
}

/**
 * The full runtime state of one match — the aggregate the engine transforms.
 * Board terrain is reference data (`GameData.maps[mapId]`), not stored here; only
 * the mutable overlays (units, properties, terrain objects) live in state.
 */
export interface MatchState {
  readonly match: MatchMeta;
  readonly players: readonly PlayerState[];
  readonly units: readonly UnitState[];
  readonly properties: readonly PropertyState[];
  readonly terrainObjects: readonly TerrainObjectState[];
}
