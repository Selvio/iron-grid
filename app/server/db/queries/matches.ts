import { and, desc, eq, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { MatchState } from "game-engine";

import { matchPlayers } from "../schema/match-players";
import { matches } from "../schema/matches";
import { users } from "../schema/users";

/** The other seat in a match, as far as the dashboard is allowed to see it. */
export interface MatchOpponentRow {
  /** The opponent's display name, or `null` when they never set one. */
  readonly name: string | null;
  /** `blue` | `green` | `red` | `yellow`, or `null` before commander selection. */
  readonly factionId: string | null;
}

/** One row of a player's match list (`GET /api/matches`, M9-T4). */
export interface MatchSummaryRow {
  readonly matchId: string;
  readonly status: (typeof matches.status)["_"]["data"];
  readonly role: (typeof matchPlayers.role)["_"]["data"];
  readonly viewerPlayerId: string;
  readonly activePlayerId: string | null;
  readonly turnDeadlineAt: string | null;
  /** The map the match is played on — the dashboard's row identity (M9-T9). */
  readonly mapId: string;
  /** The `day_counter` mirror column; `0` until the match activates. */
  readonly day: number;
  /** `null` while the second seat is unfilled (a `waiting_for_opponent` match). */
  readonly opponent: MatchOpponentRow | null;
  /**
   * The invitation the host still needs to share, or `null`. Only ever set for
   * the host of a `waiting_for_opponent` match — once the seat is filled the
   * code is spent, so nothing else has a reason to read it.
   */
  readonly invitationCode: string | null;
}

/**
 * Lists the matches a user belongs to, most-recent first (M9-T4).
 *
 * Membership-scoped: joins `match_players` to `matches` on the caller's id, so
 * the result never leaks a match the user is not in. Returns only the shell's
 * dashboard fields from the indexed mirror columns (no `state` jsonb read); the
 * `viewerPlayerId` lets the client mark "your turn" without a projection.
 *
 * M9-T9 adds the fields the designed row shows — `mapId`, `day`, and the other
 * seat's display name + faction — via a left join on the opponent seat. The
 * opponent's **email is deliberately not selected**: the dashboard identifies
 * them by name and insignia only, and the join is still anchored to the caller's
 * membership row, so it can only ever surface the opponent of a match the caller
 * is in.
 *
 * The row also carries the host's own `invitation_code` while the match is still
 * `waiting_for_opponent`, so the dashboard can re-surface a code the host closed
 * the create screen on. It is scoped to `role = 'host'` and that one status —
 * a guest never receives it, and it is `null` once the seat is filled.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T4, M9-T9)
 */
export async function listMatchesForUser<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: PgDatabase<TQuery, TSchema>, userId: string): Promise<MatchSummaryRow[]> {
  const opponentSeat = alias(matchPlayers, "opponent_seat");
  const opponentUser = alias(users, "opponent_user");

  const rows = await db
    .select({
      matchId: matches.id,
      status: matches.status,
      role: matchPlayers.role,
      viewerPlayerId: matchPlayers.id,
      activePlayerId: matches.activePlayerId,
      turnDeadlineAt: matches.turnDeadlineAt,
      mapId: matches.mapId,
      day: matches.dayCounter,
      invitationCode: matches.invitationCode,
      opponentSeatId: opponentSeat.id,
      opponentName: opponentUser.name,
      opponentFactionId: opponentSeat.factionId,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
    .leftJoin(
      opponentSeat,
      and(
        eq(opponentSeat.matchId, matches.id),
        ne(opponentSeat.id, matchPlayers.id),
      ),
    )
    .leftJoin(opponentUser, eq(opponentUser.id, opponentSeat.userId))
    .where(eq(matchPlayers.userId, userId))
    .orderBy(desc(matches.createdAt));

  return rows.map((row) => ({
    matchId: row.matchId,
    status: row.status,
    role: row.role,
    viewerPlayerId: row.viewerPlayerId,
    activePlayerId: row.activePlayerId,
    turnDeadlineAt:
      row.turnDeadlineAt === null ? null : row.turnDeadlineAt.toISOString(),
    mapId: row.mapId,
    day: row.day,
    opponent:
      row.opponentSeatId === null
        ? null
        : { name: row.opponentName, factionId: row.opponentFactionId },
    invitationCode:
      row.role === "host" && row.status === "waiting_for_opponent"
        ? row.invitationCode
        : null,
  }));
}

/**
 * Persist an authoritative match snapshot and its mirror columns atomically
 * (M4-T3).
 *
 * The `state` jsonb and every column that mirrors the snapshot's match meta —
 * `state_version`, `active_player_id`, `day_counter`, `turn_deadline_at`, and the
 * lifecycle mirrors `status`/`winner_player_id`/`completion_reason`/`completed_at`
 * — are written in a single `UPDATE`, so the indexed columns can never drift from
 * the snapshot they derive from (`database.md` §3). This is the single
 * authoritative writer of a match's engine state; M7's pipeline calls it inside
 * the action transaction after the engine returns `nextState`.
 *
 * The snapshot's `meta.stateVersion` is authoritative: this helper mirrors it to
 * the `state_version` column in the same UPDATE (`database.md` §10), so the two
 * never drift. M7 therefore bumps `meta.stateVersion` in `nextState` and persists
 * here in one write; `incrementStateVersion` (M4-T7) is for a column-only bump
 * without a snapshot rewrite — do not use both on the same commit. The row lock
 * and version compare are the separate M4-T7 primitives.
 *
 * Generic over the query-result HKT so it accepts any driver's handle (the Neon
 * client in production, PGlite in tests) or a transaction.
 *
 * @see docs/03-architecture/database.md §3, §10
 */
export async function persistMatchSnapshot<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
  state: MatchState,
): Promise<void> {
  const { match } = state;
  await db
    .update(matches)
    .set({
      state,
      stateVersion: match.stateVersion,
      activePlayerId: match.activePlayerId,
      dayCounter: match.currentDay,
      turnDeadlineAt:
        match.turnDeadlineAt === null ? null : new Date(match.turnDeadlineAt),
      status: match.status,
      winnerPlayerId: match.winnerPlayerId,
      completionReason: match.completionReason,
      completedAt:
        match.completedAt === null ? null : new Date(match.completedAt),
    })
    .where(eq(matches.id, matchId));
}
