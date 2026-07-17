import type { MatchState } from "game-engine";

/**
 * Deadline-expiry claim eligibility (M8-T2).
 *
 * The backend owns the wall clock (the engine never reads it), so the
 * deadline-expired gate for Claim Victory lives here rather than in the engine
 * (`backend.md` §9, `timeout_claim_rules`). A claim is eligible only when the
 * turn deadline is set and has passed **and** the active player has not committed
 * an action since it — `first_valid_late_action_revokes_claim`
 * (`time_model.expiration`), tracked by the backend-stamped `lastActionAt`.
 *
 * @see docs/02-data/rules.yaml → time_model.expiration, timeout_claim_rules
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T2)
 */

/** Whether the active player's turn deadline is set and has passed at `now`. */
export function deadlineExpired(state: MatchState, now: Date): boolean {
  const deadline = state.match.turnDeadlineAt;
  if (deadline === null || deadline === undefined) return false;
  return now.getTime() > new Date(deadline).getTime();
}

/**
 * Whether the inactive opponent may claim victory: the deadline has passed and no
 * action was committed after it (a late action revokes the claim, §4.4).
 */
export function isClaimEligible(state: MatchState, now: Date): boolean {
  if (!deadlineExpired(state, now)) return false;
  const lastActionAt = state.match.lastActionAt ?? null;
  if (lastActionAt === null) return true;
  const deadlineMs = new Date(state.match.turnDeadlineAt as string).getTime();
  // A committed action at or before the deadline leaves the claim intact; one
  // after it means the late player showed up and revoked the claim.
  return new Date(lastActionAt).getTime() <= deadlineMs;
}
