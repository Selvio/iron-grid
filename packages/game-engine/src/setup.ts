/**
 * `createInitialMatchState` — the deterministic match-setup builder (M6-T1).
 *
 * Match setup is game logic, so it lives in the pure engine, not the server
 * (`architecture.md` §4). Given a map, the accepted roster, the host settings, a
 * server-chosen first player and seed, it produces the initial authoritative
 * `MatchState` the backend persists at activation (`backend.md` §11,
 * `match_lifecycle.match_start`): units and properties placed from the map,
 * starting funds applied, `currentDay` initialized to 0 so the first
 * `resolveStartOfTurn` lands the match on Day 1 (`domain-model.md` §6).
 *
 * Pure over its inputs: no I/O, no wall clock (the backend stamps `startedAt`),
 * and no randomness of its own — the first player is chosen by the caller and
 * passed in, and the deterministic seed is carried through
 * (`engine_contract.purity`). Starting units begin at full state per the
 * `units.yaml` defaults (`starts_with_full_fuel` / `_ammo`).
 *
 * @see docs/03-architecture/domain-model.md §6
 * @see docs/02-data/rules.yaml → match_lifecycle.match_start
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T1)
 */

import type { GameData } from "game-data";

import { maxPointsFor } from "./capture";
import type {
  Id,
  MatchMeta,
  MatchState,
  PlayerState,
  PropertyState,
  Timestamp,
  UnitState,
} from "./state";

/** The two player slots a map declares (`maps.yaml` player_slots). */
type PlayerSlotId = "player_1" | "player_2";

/** A validated map instance, resolved from `GameData` (`maps.yaml`). */
type GameMap = GameData["maps"][string];

/** One accepted participant, binding a map slot to a resolved player identity. */
export interface RosterEntry {
  /** The `match_players.id` — the runtime `playerId` used across state. */
  readonly playerId: Id;
  /** The authenticated `users.id`, or `null` for an as-yet-unbound slot. */
  readonly userId: Id | null;
  /** Which map slot this player occupies (drives unit/property ownership). */
  readonly slot: PlayerSlotId;
  readonly factionId: string;
  readonly commanderId: string;
}

/** Everything `createInitialMatchState` needs beyond the reference `GameData`. */
export interface InitialMatchInput {
  readonly matchId: Id;
  /** The `GameData.version` pinned for this match (`game-spec` §31.2). */
  readonly dataVersion: string;
  /** The map to lay out, i.e. `gameData.maps[mapId]` (or a test fixture). */
  readonly map: GameMap;
  /** The two accepted players, one per slot. */
  readonly roster: readonly RosterEntry[];
  /** The server-random first player (`match_start.first_player_selection`). */
  readonly firstPlayerId: Id;
  /** The server-owned PRNG seed (`rules.yaml` → randomness, spec §12.6). */
  readonly seed: string;
  /** Backend-stamped activation instant; the engine never reads the clock. */
  readonly startedAt: Timestamp;
  /** Host fog setting (§18). */
  readonly fogEnabled: boolean;
}

/**
 * Builds the initial `MatchState` for an activating match.
 *
 * @throws {Error} on an invariant violation — a roster that is not exactly the
 *   two slots, a `firstPlayerId` outside the roster, or a map unit/property whose
 *   type or owner slot does not resolve. These are backend-composed inputs, not
 *   client data, so a violation is a programming error, not a validation result.
 */
export function createInitialMatchState(
  input: InitialMatchInput,
  gameData: GameData,
): MatchState {
  const slotToPlayerId = new Map<string, Id>();
  for (const entry of input.roster) {
    slotToPlayerId.set(entry.slot, entry.playerId);
  }
  if (slotToPlayerId.size !== 2 || input.roster.length !== 2) {
    throw new Error(
      `createInitialMatchState: match ${input.matchId} needs exactly two players, one per slot`,
    );
  }
  if (!input.roster.some((entry) => entry.playerId === input.firstPlayerId)) {
    throw new Error(
      `createInitialMatchState: firstPlayerId ${input.firstPlayerId} is not in the roster`,
    );
  }

  const ownerOf = (slot: string, what: string): Id => {
    const playerId = slotToPlayerId.get(slot);
    if (playerId === undefined) {
      throw new Error(
        `createInitialMatchState: ${what} references unknown slot ${slot}`,
      );
    }
    return playerId;
  };

  const players: PlayerState[] = input.roster.map((entry) => ({
    playerId: entry.playerId,
    userId: entry.userId,
    factionId: entry.factionId,
    commanderId: entry.commanderId,
    funds: input.map.starting_funds[entry.slot],
    powerMeter: 0,
    ready: true,
    resigned: false,
  }));

  const units: UnitState[] = input.map.starting_units.map((placement) => {
    const def = gameData.units[placement.type_id];
    if (def === undefined) {
      throw new Error(
        `createInitialMatchState: unit type ${placement.type_id} is not in game data`,
      );
    }
    return {
      id: placement.id,
      typeId: placement.type_id,
      ownerPlayerId: ownerOf(placement.owner, `unit ${placement.id}`),
      position: { x: placement.x, y: placement.y },
      // Starting units begin at full state (`units.yaml` defaults).
      trueHp: def.max_true_hp,
      fuel: def.logistics.max_fuel,
      ammo: def.logistics.max_ammo ?? 0,
      hasActed: false,
      captureTargetPropertyId: null,
      cargoUnitIds: [],
      // Divers surface at match start; every other unit has no special state.
      specialState: def.special_states.length > 0 ? "surfaced" : null,
      createdTurn: 0,
    };
  });

  const properties: PropertyState[] = input.map.properties.map((instance) => ({
    id: instance.id,
    typeId: instance.type_id,
    position: { x: instance.x, y: instance.y },
    ownerPlayerId:
      instance.initial_owner === "neutral"
        ? null
        : ownerOf(instance.initial_owner, `property ${instance.id}`),
    // Fresh properties start at their configured maximum (§13.3).
    capturePointsRemaining: maxPointsFor(gameData, instance.type_id),
    capturingUnitId: null,
  }));

  const match: MatchMeta = {
    id: input.matchId,
    status: "active",
    dataVersion: input.dataVersion,
    mapId: input.map.id,
    // Pre-first-turn: the backend owns the monotonic counter from here (§25).
    stateVersion: 0,
    // One below the opening day so the first start-of-turn lands on Day 1 (§6).
    currentDay: 0,
    activePlayerId: input.firstPlayerId,
    firstPlayerId: input.firstPlayerId,
    startedAt: input.startedAt,
    completedAt: null,
    winnerPlayerId: null,
    completionReason: null,
    turnDeadlineAt: null,
    expiredTurnClaimAvailableTo: null,
    deterministicSeed: input.seed,
    randomSequenceIndex: 0,
    fogEnabled: input.fogEnabled,
  };

  return { match, players, units, properties, terrainObjects: [] };
}
