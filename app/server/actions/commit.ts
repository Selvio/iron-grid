import { eq } from "drizzle-orm";
import type { GameData } from "game-data";
import {
  applyAction,
  type Action,
  type MatchState,
  type SeededRandomSource,
} from "game-engine";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  appendEvents,
  insertPlayerEvents,
  persistMatchSnapshot,
  recordIdempotentResult,
} from "../db";
import { matchPlayers } from "../db/schema/match-players";
import type { MatchSettings } from "../db/schema/matches";
import type { NewPlayerEventRow } from "../db/schema/player-events";
import { createInvitationRateLimiter } from "../lifecycle/rate-limit";
import { computeTurnDeadline } from "../lifecycle/turn-deadline";

/**
 * The shared commit tail of the action transactions (M7 pipeline + M8 claim).
 *
 * Both `handleSubmitAction` and `handleClaimVictory` reach the same point after
 * their own authz/validation: apply the validated action, bump the version and
 * random sequence in-state, stamp the backend-owned deadline / completion / late-
 * action marker, append events + per-player projections, persist the snapshot,
 * and record the idempotent result. Factored here so the two handlers share one
 * audited persistence path (`action_processing.ordered_steps` tail).
 *
 * @see app/server/actions/submit.ts
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T3)
 */

// Process-wide action rate limiter (`security_rules.action_rate_limit_required`).
// A gameplay-throughput budget (a late-game turn is many action envelopes), not
// the invitation budget — 240 actions per user per minute.
export const defaultActionRateLimiter = createInvitationRateLimiter(
  240,
  60 * 1000,
);

/** The committed-result envelope returned (and stored for idempotent replays). */
export interface ActionResult {
  readonly stateVersion: number;
  readonly status: MatchState["match"]["status"];
  readonly completed: boolean;
  readonly winnerPlayerId: string | null;
  readonly completionReason: MatchState["match"]["completionReason"];
}

/** Builds the committed-result envelope from a post-action state. */
export function toResult(state: MatchState): ActionResult {
  return {
    stateVersion: state.match.stateVersion,
    status: state.match.status,
    completed: state.match.status === "completed",
    winnerPlayerId: state.match.winnerPlayerId,
    completionReason: state.match.completionReason,
  };
}

/** Inputs the shared commit tail needs beyond the transaction handle. */
export interface CommitActionParams {
  readonly matchId: string;
  /** The current (locked) authoritative state to apply onto. */
  readonly state: MatchState;
  /** The already-authorized, engine-valid action. */
  readonly action: Action;
  readonly gameData: GameData;
  readonly random: SeededRandomSource;
  readonly now: () => Date;
  readonly turnDeadline: MatchSettings["turnDeadline"];
  readonly idempotencyKey: string;
}

/**
 * Applies `action`, persists the committed snapshot + events + idempotency, and
 * returns the committed-result envelope. Assumes the caller has locked the row and
 * performed all authz/eligibility/version checks.
 */
export async function commitAction<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  tx: PgDatabase<TQuery, TSchema>,
  params: CommitActionParams,
): Promise<ActionResult> {
  const { matchId, state, action, gameData, random, now, turnDeadline } =
    params;
  const { nextState, events } = applyAction(state, action, gameData, random);

  const completed = nextState.match.status === "completed";
  // A new turn began (end_turn hands off) → stamp its deadline off the host
  // setting; a completed match carries none. The engine cleared it and the
  // backend owns the clock (§time_model).
  const turnStarted = events.some((e) => e.type === "turn_started");
  const turnDeadlineAt = completed
    ? null
    : turnStarted
      ? computeTurnDeadline(turnDeadline, now())
      : nextState.match.turnDeadlineAt;

  const committedState: MatchState = {
    ...nextState,
    match: {
      ...nextState.match,
      stateVersion: state.match.stateVersion + 1,
      randomSequenceIndex: state.match.randomSequenceIndex + random.drawCount,
      turnDeadlineAt,
      // Late-action marker (§4.4): a new turn resets it; any other action stamps
      // its commit time so a post-deadline action revokes the claim.
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
  // Interim: per-player rows are written unprojected (fog is blocked at create).
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
  await recordIdempotentResult(tx, matchId, params.idempotencyKey, committed);
  return committed;
}
