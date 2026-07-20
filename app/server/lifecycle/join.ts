import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireUser } from "../auth/session";
import { matchPlayers } from "../db/schema/match-players";
import { matches } from "../db/schema/matches";
import { safelyEnqueue, scheduleInvitation } from "../notifications/enqueue";

import type { LifecycleDeps } from "./deps";
import { InvalidInvitationCodeError, MatchNotJoinableError } from "./errors";
import { errorResponse } from "./http";
import {
  defaultInvitationRateLimiter,
  type InvitationRateLimiter,
} from "./rate-limit";

/**
 * `POST /api/matches/:id/join` and `POST /api/matches/join` — a guest accepts
 * an invitation (M6-T3).
 *
 * Authorized by **invitation code, not membership**: the guest is not yet a
 * member (`requireMatchMembership` would reject a null-`user_id` slot, §3). The
 * code in the body must match a waiting match's stored code (optionally scoped
 * to a match id), the guest slot must still be open, and the caller must not
 * already be in it. On success the guest `match_players` row is inserted and the
 * match moves to `commander_selection` — all under the match row lock so two
 * guests cannot both accept. A missing match and a wrong code are the same typed
 * 404, so match existence never leaks.
 *
 * The code-only route exists so the dashboard can join with just the six-character
 * invitation (`invitation_code` is unique); deep links may still pass the match id.
 *
 * @see docs/03-architecture/backend.md §3
 * @see docs/02-data/rules.yaml → match_lifecycle.invitation
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T3)
 */

export interface JoinMatchDeps<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
> extends LifecycleDeps<TQuery, TSchema> {
  readonly rateLimiter?: InvitationRateLimiter;
}

/** Extracts the invitation code from a join body, or rejects it. */
function parseJoinCode(input: unknown): string {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof (input as Record<string, unknown>).code !== "string"
  ) {
    throw new InvalidInvitationCodeError();
  }
  return (input as { code: string }).code.trim().toUpperCase();
}

/**
 * Handles a join request end-to-end, returning the typed response.
 *
 * Pass `matchId` when the guest arrived via a deep link; omit it (or pass
 * `undefined`) to resolve the match solely from the invitation code.
 */
export async function handleJoinMatch<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  request: Request,
  matchId: string | undefined,
  deps: JoinMatchDeps<TQuery, TSchema>,
): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    (deps.rateLimiter ?? defaultInvitationRateLimiter).check(user.id);

    const body = await request.json().catch(() => {
      throw new InvalidInvitationCodeError();
    });
    const code = parseJoinCode(body);

    let resolvedMatchId = "";
    const hostPlayerId = await deps.db.transaction(async (tx) => {
      const [match] =
        matchId === undefined
          ? await tx
              .select({
                id: matches.id,
                status: matches.status,
                invitationCode: matches.invitationCode,
              })
              .from(matches)
              .where(eq(matches.invitationCode, code))
              .for("update")
          : await tx
              .select({
                id: matches.id,
                status: matches.status,
                invitationCode: matches.invitationCode,
              })
              .from(matches)
              .where(eq(matches.id, matchId))
              .for("update");

      // A missing match and a wrong code are indistinguishable (no leak).
      if (
        match === undefined ||
        (matchId !== undefined && match.invitationCode !== code)
      ) {
        throw new InvalidInvitationCodeError();
      }
      if (match.status !== "waiting_for_opponent") {
        throw new MatchNotJoinableError();
      }

      resolvedMatchId = match.id;

      const players = await tx
        .select({
          id: matchPlayers.id,
          userId: matchPlayers.userId,
          role: matchPlayers.role,
        })
        .from(matchPlayers)
        .where(eq(matchPlayers.matchId, resolvedMatchId));
      if (players.some((p) => p.userId === user.id)) {
        throw new MatchNotJoinableError("You are already in this match.");
      }
      if (players.some((p) => p.role === "guest")) {
        throw new MatchNotJoinableError();
      }

      await tx.insert(matchPlayers).values({
        id: randomUUID(),
        matchId: resolvedMatchId,
        userId: user.id,
        role: "guest",
      });
      await tx
        .update(matches)
        .set({ status: "commander_selection" })
        .where(eq(matches.id, resolvedMatchId));

      return players.find((p) => p.role === "host")?.id ?? null;
    });

    // Notify the host that their invitation was accepted — non-blocking
    // (`notifications.gameplay_authority: false`).
    if (hostPlayerId !== null) {
      await safelyEnqueue(() =>
        scheduleInvitation(deps.db, resolvedMatchId, hostPlayerId, new Date()),
      );
    }

    return Response.json({
      matchId: resolvedMatchId,
      status: "commander_selection",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
