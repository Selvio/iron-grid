import { eq } from "drizzle-orm";
import { createRandomSource, type Action } from "game-engine";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { requireMatchMembership } from "../auth/membership";
import { requireUser } from "../auth/session";
import { assertStateVersion, getIdempotentResult } from "../db";
import { matches } from "../db/schema/matches";

import { deadlineExpired, isClaimEligible } from "./claim-eligibility";
import { commitAction, defaultActionRateLimiter } from "./commit";
import type { ActionDeps } from "./deps";
import { parseActionEnvelope } from "./envelope";
import {
  DeadlineNotExpiredError,
  MatchAlreadyCompletedError,
  MatchNotActiveError,
  VictoryClaimUnavailableError,
} from "./errors";
import { errorResponse } from "./http";

/**
 * `POST /api/matches/:id/actions` with `type: "claim_victory"` (M8-T3).
 *
 * A bespoke sibling of the M7 pipeline (`backend.md` §3, §9): it shares the
 * commit tail (`commitAction`) but **inverts the authz head** — the claimant must
 * be the **inactive** opponent — and adds the **deadline-expired** gate the engine
 * cannot evaluate (clock). Under the match row lock, in one transaction: verify
 * membership, idempotency short-circuit, active match, `expectedStateVersion`
 * (the claim-vs-late-action race resolves here), inactive-opponent, deadline
 * expired and not revoked, then apply and complete
 * (`timeout_claimed`). Typed failures: `deadline_not_expired`,
 * `victory_claim_unavailable`, `stale_state_version`, `match_already_completed`.
 *
 * Receives the already-parsed body from `handleSubmitAction`'s dispatch.
 *
 * @see docs/03-architecture/backend.md §9
 * @see docs/02-data/rules.yaml → timeout_claim_rules
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T3)
 */
export async function handleClaimVictory<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  rawBody: unknown,
  matchId: string,
  deps: ActionDeps<TQuery, TSchema>,
): Promise<Response> {
  try {
    const user = await requireUser(deps.resolveSession);
    (deps.rateLimiter ?? defaultActionRateLimiter).check(user.id);

    const envelope = parseActionEnvelope(rawBody);
    const makeRandom = deps.randomSourceFactory ?? createRandomSource;
    const now = deps.now ?? (() => new Date());

    const result = await deps.db.transaction(async (tx) => {
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

      assertStateVersion(
        state.match.stateVersion,
        envelope.expectedStateVersion,
      );

      // The claimant must be the inactive opponent, and the deadline must have
      // passed with no late action revoking it (`timeout_claim_rules`).
      if (state.match.activePlayerId === membership.playerId) {
        throw new VictoryClaimUnavailableError();
      }
      if (!deadlineExpired(state, now())) {
        throw new DeadlineNotExpiredError();
      }
      if (!isClaimEligible(state, now())) {
        throw new VictoryClaimUnavailableError();
      }

      const action: Action = {
        type: "claim_victory",
        matchId,
        playerId: membership.playerId,
        expectedStateVersion: envelope.expectedStateVersion,
        idempotencyKey: envelope.idempotencyKey,
      };
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
