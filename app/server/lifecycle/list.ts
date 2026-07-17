import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireUser } from "../auth/session";
import { listMatchesForUser } from "../db/queries/matches";

import type { LifecycleDeps } from "./deps";
import { errorResponse } from "./http";

/**
 * `GET /api/matches` — the caller's match list (M9-T4).
 *
 * The dashboard's data source. `requireUser`, then a membership-scoped list of
 * the user's matches (`listMatchesForUser`) — no match the user is not in ever
 * appears. Read-only; no schema change. The dashboard groups the rows into
 * "your turn" / "waiting" and renders deadline countdowns client-side.
 *
 * @see docs/04-development/milestones/m9-app-shell.md (M9-T4)
 */
export async function handleListMatches<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(deps: LifecycleDeps<TQuery, TSchema>): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    const matches = await listMatchesForUser(deps.db, user.id);
    return Response.json(matches);
  } catch (error) {
    return errorResponse(error);
  }
}
