import { eq } from "drizzle-orm";
import type { MatchStatus } from "game-engine";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireMatchMembership } from "../auth/membership";
import { requireUser } from "../auth/session";
import { matches } from "../db/schema/matches";

import type { LifecycleDeps } from "./deps";
import { InvalidLifecycleTransitionError } from "./errors";
import { errorResponse } from "./http";

/**
 * `POST /api/matches/:id/cancel` — cancel a match before activation (M6-T6).
 *
 * `requireUser` + `requireMatchMembership`. Under the match row lock, a match in
 * any pre-active status moves to `cancelled`; an already-active, completed or
 * cancelled match is rejected (`cancellation.allowed_after_active: false` —
 * ending a live match is resignation/claim, M7/M8, not cancel).
 *
 * @see docs/03-architecture/backend.md §3
 * @see docs/02-data/rules.yaml → match_lifecycle.cancellation
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T6)
 */

/** The statuses from which a match may still be cancelled (`domain-model.md` §6.1). */
const CANCELLABLE_STATUSES: readonly MatchStatus[] = [
  "draft",
  "waiting_for_opponent",
  "commander_selection",
  "ready_check",
];

/** Handles a cancel request end-to-end, returning the typed response. */
export async function handleCancelMatch<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(matchId: string, deps: LifecycleDeps<TQuery, TSchema>): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);

    await deps.db.transaction(async (tx) => {
      const [match] = await tx
        .select({ status: matches.status })
        .from(matches)
        .where(eq(matches.id, matchId))
        .for("update");

      // Membership first — a non-member (or unknown match) is a 403, no leak.
      await requireMatchMembership(tx, user.id, matchId);
      if (match === undefined || !CANCELLABLE_STATUSES.includes(match.status)) {
        throw new InvalidLifecycleTransitionError();
      }

      await tx
        .update(matches)
        .set({ status: "cancelled" })
        .where(eq(matches.id, matchId));
    });

    return Response.json({ matchId, status: "cancelled" });
  } catch (error) {
    return errorResponse(error);
  }
}
