import { eq } from "drizzle-orm";
import {
  applyAction,
  createRandomSource,
  validateAction,
  type MatchState,
} from "game-engine";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireMatchMembership } from "../auth/membership";
import { requireUser } from "../auth/session";
import {
  appendEvents,
  assertStateVersion,
  getIdempotentResult,
  insertPlayerEvents,
  persistMatchSnapshot,
  recordIdempotentResult,
} from "../db";
import { matchPlayers } from "../db/schema/match-players";
import { matches } from "../db/schema/matches";
import type { NewPlayerEventRow } from "../db/schema/player-events";
import { createInvitationRateLimiter } from "../lifecycle/rate-limit";

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
 * `db.transaction` (`backend.md` §4): idempotency short-circuit → lock →
 * membership → status → version → active-player → validate → seeded randomness →
 * apply → events + projections → persist → record idempotency. A failure rolls the
 * whole transaction back — no partial commit, no `state_version` / random / ammo /
 * funds consumed (`action_processing.failure`).
 *
 * The version bump is **in-state** (`meta.stateVersion` +1), mirrored to the column
 * by `persistMatchSnapshot` — never also `incrementStateVersion` (`m7-actions.md`
 * §3). Per-player projections are written **unprojected** here; fog-filtered
 * projection is M7-T6.
 *
 * @see docs/03-architecture/backend.md §4, §8
 * @see docs/04-development/milestones/m7-actions.md (M7-T3)
 */

/** Process-wide action rate limiter (`security_rules.action_rate_limit_required`). */
const defaultActionRateLimiter = createInvitationRateLimiter();

/** The committed-result envelope returned (and stored for idempotent replays). */
export interface ActionResult {
  readonly stateVersion: number;
  readonly status: MatchState["match"]["status"];
  readonly completed: boolean;
  readonly winnerPlayerId: string | null;
  readonly completionReason: MatchState["match"]["completionReason"];
}

/** Builds the committed-result envelope from a post-action state. */
function toResult(state: MatchState): ActionResult {
  return {
    stateVersion: state.match.stateVersion,
    status: state.match.status,
    completed: state.match.status === "completed",
    winnerPlayerId: state.match.winnerPlayerId,
    completionReason: state.match.completionReason,
  };
}

/** Handles a `POST /api/matches/:id/actions` submission end-to-end. */
export async function handleSubmitAction<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  request: Request,
  matchId: string,
  deps: ActionDeps<TQuery, TSchema>,
): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    (deps.rateLimiter ?? defaultActionRateLimiter).check(user.id);

    const rawBody = await request.json().catch(() => {
      throw new InvalidActionError("Body must be valid JSON.");
    });
    const envelope = parseActionEnvelope(rawBody);
    const makeRandom = deps.randomSourceFactory ?? createRandomSource;

    const result = await deps.db.transaction(async (tx) => {
      // Idempotency short-circuit: a retried key returns its original result.
      const prior = await getIdempotentResult(
        tx,
        matchId,
        envelope.idempotencyKey,
      );
      if (prior !== null) return prior.result;

      // Lock the match row, then authorize membership within the lock.
      const [row] = await tx
        .select({ status: matches.status, state: matches.state })
        .from(matches)
        .where(eq(matches.id, matchId))
        .for("update");
      const membership = await requireMatchMembership(tx, user.id, matchId);

      if (row === undefined || row.state === null) {
        throw new MatchNotActiveError();
      }
      if (row.status !== "active") {
        throw row.status === "completed"
          ? new MatchAlreadyCompletedError()
          : new MatchNotActiveError();
      }
      const state = row.state;

      // Parse the payload now that the server-owned playerId is known.
      const action = parseAction(rawBody, {
        matchId,
        playerId: membership.playerId,
        generateUnitId: deps.generateUnitId,
      });

      // Optimistic concurrency, then active-player, then legality.
      assertStateVersion(state.match.stateVersion, action.expectedStateVersion);
      if (state.match.activePlayerId !== membership.playerId) {
        throw new NotActivePlayerError();
      }
      const validation = validateAction(state, action, deps.gameData);
      if (!validation.valid) {
        throw new ActionValidationError(validation.errors.map((e) => e.code));
      }

      // Deterministic randomness seeded from the match, then apply.
      const random = makeRandom(
        state.match.deterministicSeed,
        state.match.randomSequenceIndex,
      );
      const { nextState, events } = applyAction(
        state,
        action,
        deps.gameData,
        random,
      );

      // Bump version and advance the random sequence in-state (committed only).
      const committedState: MatchState = {
        ...nextState,
        match: {
          ...nextState.match,
          stateVersion: state.match.stateVersion + 1,
          randomSequenceIndex:
            state.match.randomSequenceIndex + random.drawCount,
        },
      };

      const appended = await appendEvents(
        tx,
        matchId,
        events.map((event) => ({ type: event.type, payload: event })),
      );
      // Interim: write per-player rows unprojected (T6 fog-projects them).
      const players = await tx
        .select({ id: matchPlayers.id })
        .from(matchPlayers)
        .where(eq(matchPlayers.matchId, matchId));
      const projections: NewPlayerEventRow[] = appended.flatMap((ev) =>
        players.map((p) => ({
          matchId,
          playerId: p.id,
          sequence: ev.sequence,
          type: ev.type,
          payload: ev.payload,
        })),
      );
      await insertPlayerEvents(tx, projections);

      await persistMatchSnapshot(tx, matchId, committedState);

      const committed = toResult(committedState);
      await recordIdempotentResult(
        tx,
        matchId,
        envelope.idempotencyKey,
        committed,
      );
      return committed;
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
