import { randomBytes, randomInt } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { GameData } from "game-data";
import {
  createInitialMatchState,
  resolveStartOfTurn,
  type MatchState,
  type RosterEntry,
} from "game-engine";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireMatchMembership } from "../auth/membership";
import { requireUser } from "../auth/session";
import {
  appendEvents,
  insertPlayerEvents,
  persistMatchSnapshot,
  pinGameDataVersion,
} from "../db";
import { matchPlayers } from "../db/schema/match-players";
import { matches, type MatchSettings } from "../db/schema/matches";
import type { NewPlayerEventRow } from "../db/schema/player-events";

import type { LifecycleDeps } from "./deps";
import { InvalidLifecycleTransitionError } from "./errors";
import { errorResponse } from "./http";

/**
 * `POST /api/matches/:id/ready` — confirm ready and activate (M6-T5).
 *
 * `requireUser` + `requireMatchMembership`. The first ready sets the flag; when
 * **both** members are ready the match activates **atomically** under the row
 * lock (`match_lifecycle.match_start`, `backend.md` §8, §11): a server-random
 * first player and seed, the initial snapshot built by the engine
 * (`createInitialMatchState`) and advanced by the first `resolveStartOfTurn`, the
 * pinned `game_data_version`, and the `match_started` + `turn_started` events with
 * their per-player rows — all in one transaction. Re-entry after activation is
 * blocked because the status is no longer `ready_check`.
 *
 * Per-player projections are written **unprojected** here (activation events are
 * public); fog-filtered projection of gameplay is M7 (`player-events.ts`).
 *
 * @see docs/03-architecture/backend.md §3, §8, §11
 * @see docs/02-data/rules.yaml → match_lifecycle.ready_check, match_start
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T5)
 */

/** Turn-deadline durations in ms, or null for an untimed match. */
const TURN_DEADLINE_MS: Record<MatchSettings["turnDeadline"], number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  none: null,
};

export interface ReadyDeps<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
> extends LifecycleDeps<TQuery, TSchema> {
  /** Reference data the initial state is built from. */
  readonly gameData: GameData;
  /** Activation clock (injected in tests); defaults to the wall clock. */
  readonly now?: () => Date;
  /** Server-random first player (injected in tests). */
  readonly chooseFirstPlayer?: (playerIds: readonly string[]) => string;
  /** Server seed generator (injected in tests). */
  readonly generateSeed?: () => string;
}

/** A `match_players` row as activation needs it. */
interface PlayerRow {
  readonly id: string;
  readonly userId: string | null;
  readonly role: "host" | "guest";
  readonly factionId: string | null;
  readonly commanderId: string | null;
  readonly isReady: boolean;
}

/** Builds the engine roster from the two accepted, commander-bound players. */
function buildRoster(players: readonly PlayerRow[]): RosterEntry[] {
  return players.map((p) => {
    if (p.factionId === null || p.commanderId === null) {
      // Both selected during commander_selection; a null here means the match
      // was not actually ready to activate.
      throw new InvalidLifecycleTransitionError();
    }
    return {
      playerId: p.id,
      userId: p.userId,
      slot: p.role === "host" ? "player_1" : "player_2",
      factionId: p.factionId,
      commanderId: p.commanderId,
    };
  });
}

/** Stamps the turn deadline onto the freshly started state's meta. */
function withTurnDeadline(
  state: MatchState,
  deadline: MatchSettings["turnDeadline"],
  now: Date,
): MatchState {
  const ms = TURN_DEADLINE_MS[deadline];
  const turnDeadlineAt =
    ms === null ? null : new Date(now.getTime() + ms).toISOString();
  return { ...state, match: { ...state.match, turnDeadlineAt } };
}

/** Handles a ready request end-to-end, activating when both members are ready. */
export async function handleReadyMatch<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  request: Request,
  matchId: string,
  deps: ReadyDeps<TQuery, TSchema>,
): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const chooseFirstPlayer =
    deps.chooseFirstPlayer ?? ((ids) => ids[randomInt(ids.length)]!);
  const generateSeed =
    deps.generateSeed ?? (() => randomBytes(16).toString("hex"));

  try {
    const user = await requireUser(deps.resolveSession);

    const result = await deps.db.transaction(async (tx) => {
      const [match] = await tx
        .select({
          status: matches.status,
          mapId: matches.mapId,
          settings: matches.settings,
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .for("update");

      await requireMatchMembership(tx, user.id, matchId);
      if (match === undefined || match.status !== "ready_check") {
        throw new InvalidLifecycleTransitionError();
      }

      await tx
        .update(matchPlayers)
        .set({ isReady: true })
        .where(
          and(
            eq(matchPlayers.matchId, matchId),
            eq(matchPlayers.userId, user.id),
          ),
        );

      const players: PlayerRow[] = await tx
        .select({
          id: matchPlayers.id,
          userId: matchPlayers.userId,
          role: matchPlayers.role,
          factionId: matchPlayers.factionId,
          commanderId: matchPlayers.commanderId,
          isReady: matchPlayers.isReady,
        })
        .from(matchPlayers)
        .where(eq(matchPlayers.matchId, matchId));

      const bothReady = players.length === 2 && players.every((p) => p.isReady);
      if (!bothReady) {
        return { status: "ready_check" as const };
      }

      // --- Activation (atomic, under the row lock) ---
      const map = deps.gameData.maps[match.mapId];
      if (map === undefined) {
        throw new InvalidLifecycleTransitionError();
      }
      const activationAt = now();
      const seed = generateSeed();
      const roster = buildRoster(players);
      const firstPlayerId = chooseFirstPlayer(roster.map((r) => r.playerId));

      const initial = createInitialMatchState(
        {
          matchId,
          dataVersion: deps.gameData.version,
          map,
          roster,
          firstPlayerId,
          seed,
          startedAt: activationAt.toISOString(),
          fogEnabled: match.settings.fogEnabled,
        },
        deps.gameData,
      );
      const started = resolveStartOfTurn(initial, deps.gameData);
      const activeState = withTurnDeadline(
        started.nextState,
        match.settings.turnDeadline,
        activationAt,
      );

      await pinGameDataVersion(tx, matchId, deps.gameData.version);
      await persistMatchSnapshot(tx, matchId, activeState);
      await tx
        .update(matches)
        .set({ randomSeed: seed, activatedAt: activationAt })
        .where(eq(matches.id, matchId));

      const appended = await appendEvents(tx, matchId, [
        {
          type: "match_started",
          payload: { firstPlayerId, mapId: match.mapId },
        },
        ...started.events.map((event) => ({
          type: event.type,
          payload: event,
        })),
      ]);
      const projections: NewPlayerEventRow[] = appended.flatMap((row) =>
        players.map((p) => ({
          matchId,
          playerId: p.id,
          sequence: row.sequence,
          type: row.type,
          payload: row.payload,
        })),
      );
      await insertPlayerEvents(tx, projections);

      return { status: "active" as const };
    });

    return Response.json({ matchId, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
