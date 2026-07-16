import { and, eq } from "drizzle-orm";
import type { GameData } from "game-data";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireMatchMembership } from "../auth/membership";
import { requireUser } from "../auth/session";
import { matchPlayers } from "../db/schema/match-players";
import { matches } from "../db/schema/matches";

import type { LifecycleDeps } from "./deps";
import {
  CommanderUnavailableError,
  InvalidLifecycleTransitionError,
} from "./errors";
import { errorResponse } from "./http";

/**
 * `POST /api/matches/:id/commander` — select commander + faction (M6-T4).
 *
 * `requireUser` + `requireMatchMembership` (both players are accepted members).
 * Under the match row lock: the commander id must resolve in the (placeholder)
 * roster, its bound faction must be free, and neither may already be taken by the
 * opponent (the landed `match_players` unique constraints are the final guard).
 * When both members have selected, the match gates to `ready_check`.
 *
 * Scope note (`m6-lifecycle.md` §3): strict pick **ordering** — the server-random
 * first picker going before the second, who sees the first choice — needs a
 * pick-order column the M4 schema does not have and the real commander UX (M9);
 * it is deferred. Any member may select in any order here; uniqueness and the
 * ready gate are enforced.
 *
 * @see docs/03-architecture/backend.md §3
 * @see docs/02-data/rules.yaml → match_lifecycle.commander_selection, commander_rules
 * @see docs/04-development/milestones/m6-lifecycle.md (M6-T4)
 */

export interface CommanderDeps<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
> extends LifecycleDeps<TQuery, TSchema> {
  /** Reference data — the commander roster a selection is validated against. */
  readonly gameData: GameData;
}

/** Extracts the chosen commander id from the body, or rejects it. */
function parseCommanderId(input: unknown): string {
  if (
    typeof input !== "object" ||
    input === null ||
    typeof (input as Record<string, unknown>).commanderId !== "string"
  ) {
    throw new CommanderUnavailableError("A commander id is required.");
  }
  return (input as { commanderId: string }).commanderId;
}

/** Handles a commander-selection request end-to-end. */
export async function handleSelectCommander<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  request: Request,
  matchId: string,
  deps: CommanderDeps<TQuery, TSchema>,
): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    const body = await request.json().catch(() => {
      throw new CommanderUnavailableError("Body must be valid JSON.");
    });
    const commanderId = parseCommanderId(body);

    const result = await deps.db.transaction(async (tx) => {
      const [match] = await tx
        .select({ status: matches.status })
        .from(matches)
        .where(eq(matches.id, matchId))
        .for("update");

      // Membership first — a non-member (or unknown match) is a 403, no leak.
      await requireMatchMembership(tx, user.id, matchId);
      if (match === undefined || match.status !== "commander_selection") {
        throw new InvalidLifecycleTransitionError();
      }

      const commander = deps.gameData.commanders.commanders[commanderId];
      if (commander === undefined) {
        throw new CommanderUnavailableError();
      }
      const factionId = commander.faction_id;

      const players = await tx
        .select({
          userId: matchPlayers.userId,
          commanderId: matchPlayers.commanderId,
          factionId: matchPlayers.factionId,
        })
        .from(matchPlayers)
        .where(eq(matchPlayers.matchId, matchId));

      // The opponent must not already hold this commander or faction.
      const opponentTook = players.some(
        (p) =>
          p.userId !== user.id &&
          (p.commanderId === commanderId || p.factionId === factionId),
      );
      if (opponentTook) {
        throw new CommanderUnavailableError();
      }

      await tx
        .update(matchPlayers)
        .set({ commanderId, factionId })
        .where(
          and(
            eq(matchPlayers.matchId, matchId),
            eq(matchPlayers.userId, user.id),
          ),
        );

      // Gate to ready_check once both accepted members have a commander.
      const selections = await tx
        .select({ commanderId: matchPlayers.commanderId })
        .from(matchPlayers)
        .where(eq(matchPlayers.matchId, matchId));
      const bothSelected =
        selections.length === 2 &&
        selections.every((p) => p.commanderId !== null);
      if (bothSelected) {
        await tx
          .update(matches)
          .set({ status: "ready_check" })
          .where(eq(matches.id, matchId));
      }

      return {
        status: bothSelected ? "ready_check" : "commander_selection",
        commanderId,
        factionId,
      };
    });

    return Response.json({ matchId, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
