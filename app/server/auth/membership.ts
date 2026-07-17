import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { matchPlayers, type MatchPlayerRow } from "../db/schema/match-players";

import { MembershipForbiddenError } from "./errors";

/**
 * Match-membership authorization guard (M5-T4).
 *
 * The reusable primitive that enforces `validate_membership_on_every_read` /
 * `_on_every_write` (`backend.md` §7, §12): a session may touch a match only when
 * it owns an **accepted** `match_players` row for it — the host, or a guest whose
 * invitation has been accepted (`user_id` set, M4-T4 / spec §3.3). It is a
 * standalone function; M6/M7 place it at the head of their lifecycle and action
 * flows (`action_processing.ordered_steps`) — nothing wires it into an endpoint
 * here.
 *
 * Like the M4 db primitives (`lockMatchForUpdate`), it threads the caller's db /
 * transaction handle so M7 can run it inside the same transaction as the mutation
 * it guards. It reads through the db layer and returns the membership so callers
 * need not re-query (`domain-model.md` §7).
 *
 * @see docs/03-architecture/backend.md §7, §12
 * @see docs/03-architecture/domain-model.md §7
 * @see docs/04-development/milestones/m5-auth.md (M5-T4)
 */

/** The accepted membership a guard resolves — enough that callers avoid a re-query. */
export interface MatchMembership {
  /** The `match_players.id` of the accepted row. */
  readonly playerId: string;
  readonly matchId: string;
  /** The authenticated `users.id` — always non-null for an accepted member. */
  readonly userId: string;
  /** Host created the match; guest joined by invitation (`domain-model.md` §7). */
  readonly role: MatchPlayerRow["role"];
  readonly factionId: string | null;
  readonly commanderId: string | null;
  readonly isReady: boolean;
}

/**
 * Resolves the caller's accepted membership in the match, or raises the typed 403.
 *
 * Keyed on `(matchId, userId)`: an accepted host/guest row exists only when its
 * `user_id` equals the session user, so a pending guest slot (`user_id` null) and
 * a non-member both miss — and so does an unknown match, deliberately
 * indistinguishable so existence never leaks (`backend.md` §12).
 *
 * A normal match gives each user exactly one row. `preferPlayerId` supports the
 * **practice / hotseat** match a dev seed creates, where the same user owns BOTH
 * sides: when given (the active player id) and it matches one of the caller's
 * rows, that row is returned, so the caller acts as whichever side is active. It
 * has no effect on a normal match (one row), so it is safe — a real opponent can
 * never resolve to your player.
 *
 * @throws {@link MembershipForbiddenError} when the session is not an accepted member.
 */
export async function requireMatchMembership<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  userId: string,
  matchId: string,
  preferPlayerId?: string,
): Promise<MatchMembership> {
  const rows = await db
    .select()
    .from(matchPlayers)
    .where(
      and(eq(matchPlayers.matchId, matchId), eq(matchPlayers.userId, userId)),
    );

  const row =
    (preferPlayerId !== undefined
      ? rows.find((r) => r.id === preferPlayerId)
      : undefined) ?? rows[0];

  if (row === undefined) {
    throw new MembershipForbiddenError();
  }

  return {
    playerId: row.id,
    matchId: row.matchId,
    // The `user_id = userId` filter guarantees this matched a non-null column.
    userId,
    role: row.role,
    factionId: row.factionId,
    commanderId: row.commanderId,
    isReady: row.isReady,
  };
}
