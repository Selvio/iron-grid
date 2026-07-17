import { eq } from "drizzle-orm";
import { createRandomSource, validateAction } from "game-engine";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireMatchMembership } from "../auth/membership";
import { requireUser } from "../auth/session";
import { assertStateVersion, getIdempotentResult } from "../db";
import { matches } from "../db/schema/matches";

import { handleClaimVictory } from "./claim";
import { commitAction, defaultActionRateLimiter } from "./commit";
import type { ActionDeps } from "./deps";
import { parseAction, parseActionEnvelope } from "./envelope";
import {
  ActionValidationError,
  InvalidActionError,
  MatchAlreadyCompletedError,
  MatchNotActiveError,
  NotActivePlayerError,
} from "./errors";
import { errorResponse } from "./http";

/**
 * The transactional action pipeline and its handler (M7-T3).
 *
 * `handleSubmitAction` runs `action_processing.ordered_steps` as one atomic
 * `db.transaction` (`backend.md` §4): lock → membership → idempotency
 * short-circuit → status → version → active-player → validate → seeded randomness
 * → apply → events + projections → persist → record idempotency. A failure rolls
 * the whole transaction back — no partial commit, no `state_version` / random /
 * ammo / funds consumed (`action_processing.failure`).
 *
 * A `claim_victory` envelope is dispatched to `handleClaimVictory` (M8) — it has
 * the inverse authz (the inactive opponent) and its own eligibility gate, so it
 * does not run the active-player pipeline here. The version bump is **in-state**
 * (`meta.stateVersion` +1), mirrored by `persistMatchSnapshot` — never also
 * `incrementStateVersion`.
 *
 * @see docs/03-architecture/backend.md §4, §8
 * @see docs/04-development/milestones/m7-actions.md (M7-T3)
 */
export async function handleSubmitAction<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  request: Request,
  matchId: string,
  deps: ActionDeps<TQuery, TSchema>,
): Promise<Response> {
  try {
    const rawBody = await request.json().catch(() => {
      throw new InvalidActionError("Body must be valid JSON.");
    });

    // Claim Victory has its own transactional rules (inactive-opponent authz +
    // deadline gate) — dispatch it before the active-player pipeline (`backend.md`
    // §3, §9).
    if ((rawBody as { type?: unknown }).type === "claim_victory") {
      return await handleClaimVictory(rawBody, matchId, deps);
    }

    const user = await requireUser(deps.resolveSession);
    (deps.rateLimiter ?? defaultActionRateLimiter).check(user.id);

    const envelope = parseActionEnvelope(rawBody);
    const makeRandom = deps.randomSourceFactory ?? createRandomSource;
    const now = deps.now ?? (() => new Date());

    const result = await deps.db.transaction(async (tx) => {
      // Lock the match row, then authorize membership within the lock.
      const [row] = await tx
        .select({
          status: matches.status,
          state: matches.state,
          settings: matches.settings,
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .for("update");
      const membership = await requireMatchMembership(tx, user.id, matchId);

      // Idempotency short-circuit — AFTER membership (a non-member never learns a
      // stored result) and under the lock (a concurrent retry re-reads the now-
      // committed key and replays instead of racing to a stale-version 409).
      const prior = await getIdempotentResult(
        tx,
        matchId,
        envelope.idempotencyKey,
      );
      if (prior !== null) return prior.result;

      if (row === undefined || row.state === null) {
        throw new MatchNotActiveError();
      }
      if (row.status !== "active") {
        throw row.status === "completed"
          ? new MatchAlreadyCompletedError()
          : new MatchNotActiveError();
      }
      const state = row.state;

      // Optimistic concurrency check before the payload parse (ordered_steps:
      // verify_expected_state_version precedes validate_action_payload_schema).
      assertStateVersion(
        state.match.stateVersion,
        envelope.expectedStateVersion,
      );

      // Parse the payload now that the server-owned playerId is known.
      const action = parseAction(rawBody, {
        matchId,
        playerId: membership.playerId,
        generateUnitId: deps.generateUnitId,
      });

      // Active player, then legality.
      if (state.match.activePlayerId !== membership.playerId) {
        throw new NotActivePlayerError();
      }
      const validation = validateAction(state, action, deps.gameData);
      if (!validation.valid) {
        throw new ActionValidationError(validation.errors.map((e) => e.code));
      }

      const random = makeRandom(
        state.match.deterministicSeed,
        state.match.randomSequenceIndex,
      );
      return commitAction(tx, {
        matchId,
        state,
        action,
        gameData: deps.gameData,
        random,
        now,
        turnDeadline: row.settings.turnDeadline,
        idempotencyKey: envelope.idempotencyKey,
      });
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
