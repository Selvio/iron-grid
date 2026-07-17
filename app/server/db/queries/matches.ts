import { desc, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { MatchState } from "game-engine";

import { matchPlayers } from "../schema/match-players";
import { matches } from "../schema/matches";

/** One row of a player's match list (`GET /api/matches`, M9-T4). */
export interface MatchSummaryRow {
  readonly matchId: string;
  readonly status: (typeof matches.status)["_"]["data"];
  readonly role: (typeof matchPlayers.role)["_"]["data"];
  readonly viewerPlayerId: string;
  readonly activePlayerId: string | null;
  readonly turnDeadlineAt: string | null;
}

/**
 * Lists the matches a user belongs to, most-recent first (M9-T4).
 *
 * Membership-scoped: joins `match_players` to `matches` on the caller's id, so
 * the result never leaks a match the user is not in. Returns only the shell's
 * dashboard fields from the indexed mirror columns (no `state` jsonb read); the
 * `viewerPlayerId` lets the client mark "your turn" without a projection.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T4)
 */
export async function listMatchesForUser<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: PgDatabase<TQuery, TSchema>, userId: string): Promise<MatchSummaryRow[]> {
  const rows = await db
    .select({
      matchId: matches.id,
      status: matches.status,
      role: matchPlayers.role,
      viewerPlayerId: matchPlayers.id,
      activePlayerId: matches.activePlayerId,
      turnDeadlineAt: matches.turnDeadlineAt,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
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
