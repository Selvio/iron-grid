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
import { computeTurnDeadline } from "../lifecycle/turn-deadline";

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

// Process-wide action rate limiter (`security_rules.action_rate_limit_required`).
// A gameplay-throughput budget (a late-game turn is many action envelopes), not
// the invitation budget — 240 actions per user per minute.
const defaultActionRateLimiter = createInvitationRateLimiter(240, 60 * 1000);

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

      const completed = nextState.match.status === "completed";
      // A new turn began (end_turn hands off) — stamp its deadline off the host
      // setting; the engine cleared it and the backend owns the clock
      // (§time_model). A completed match carries no deadline.
      const turnStarted = events.some((e) => e.type === "turn_started");
      const turnDeadlineAt = completed
        ? null
        : turnStarted
          ? computeTurnDeadline(row.settings.turnDeadline, now())
          : nextState.match.turnDeadlineAt;

      // Bump version and advance the random sequence in-state (committed only);
      // stamp the backend-owned completion time when the action ends the match.
      const committedState: MatchState = {
        ...nextState,
        match: {
          ...nextState.match,
          stateVersion: state.match.stateVersion + 1,
          randomSequenceIndex:
            state.match.randomSequenceIndex + random.drawCount,
          turnDeadlineAt,
          // Late-action marker (§4.4): a new turn resets it; any other action
          // stamps its commit time so a post-deadline action revokes the claim.
          lastActionAt: turnStarted ? null : now().toISOString(),
          completedAt: completed
            ? (nextState.match.completedAt ?? now().toISOString())
            : nextState.match.completedAt,
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
