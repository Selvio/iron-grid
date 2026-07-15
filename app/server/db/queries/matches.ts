import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { MatchState } from "game-engine";

import { matches } from "../schema/matches";

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
 * The version compare/increment and the row lock are separate primitives (M4-T7);
 * this helper writes whatever `stateVersion` the snapshot already carries.
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
