import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { MembershipForbiddenError } from "../auth/errors";
import { requireUser } from "../auth/session";
import { getReadyCheckForUser } from "../db/queries/matches";

import type { LifecycleDeps } from "./deps";
import { errorResponse } from "./http";

/**
 * `GET /api/matches/:id/ready` — the ready check's live state (M11-T1).
 *
 * The read side of the ready check, so the screen can watch for the opponent
 * confirming instead of asking the player to reload. It cannot ride the event
 * stream: `POST …/ready` flips `match_players.is_ready` without appending a
 * `player_event`, so there is nothing for `…/events?since=` to return until the
 * match actually activates.
 *
 * Reuses `getReadyCheckForUser` — the same membership-scoped query the page
 * renders from — so the polled shape and the server-rendered shape cannot drift.
 * A non-member gets the same typed 403 as every other match read.
 *
 * @see app/(app)/matches/[id]/ready/page.tsx
 */
export async function handleGetReadyState<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(matchId: string, deps: LifecycleDeps<TQuery, TSchema>): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    const match = await getReadyCheckForUser(deps.db, matchId, user.id);
    if (match === null) throw new MembershipForbiddenError();

    // Only what the screen renders. `getReadyCheckForUser` also carries each
    // seat's display name, which neither the page nor the poll draws — sending
    // it would re-transmit the opponent's name every few seconds for nothing.
    return Response.json(
      {
        matchId: match.matchId,
        status: match.status,
        seats: match.seats.map((seat) => ({
          playerId: seat.playerId,
          factionId: seat.factionId,
          isReady: seat.isReady,
          isViewer: seat.isViewer,
        })),
      },
      // Caller-dependent (`isViewer`) and fetched dozens of times a session:
      // never let anything between here and the tab hold on to it.
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
