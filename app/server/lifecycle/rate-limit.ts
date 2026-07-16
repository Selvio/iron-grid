import { RateLimitedError } from "./errors";

/**
 * Invitation rate limiting (M6-T2/T3).
 *
 * `security_rules.invitation_rate_limit_required` bounds how often a user may
 * create invitations or attempt joins (`backend.md` §12), deferred to M6 from M5
 * §3. This is a **per-process, in-memory sliding window** — enough to enforce the
 * contract for the single-instance MVP and to give the endpoints an injectable
 * seam. A durable / cross-instance limiter (Redis, etc.) is a later infra concern.
 *
 * The limiter is injected into the endpoints, so tests pass a fresh (or
 * permissive) instance and never share state.
 *
 * @see docs/02-data/rules.yaml → security_rules.invitation_rate_limit_required
 * @see docs/04-development/milestones/m6-lifecycle.md (§3)
 */

/** Bounds how frequently a key (a user id) may perform an invitation action. */
export interface InvitationRateLimiter {
  /** Records one hit for `key`; throws {@link RateLimitedError} if over budget. */
  check(key: string): void;
}

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

/**
 * Builds an in-memory sliding-window limiter allowing `limit` hits per
 * `windowMs` per key.
 */
export function createInvitationRateLimiter(
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS,
): InvitationRateLimiter {
  const hits = new Map<string, number[]>();
  return {
    check(key: string): void {
      const now = Date.now();
      const cutoff = now - windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (recent.length >= limit) {
        throw new RateLimitedError();
      }
      recent.push(now);
      hits.set(key, recent);
    },
  };
}

/** The process-wide default limiter the endpoints use when none is injected. */
export const defaultInvitationRateLimiter: InvitationRateLimiter =
  createInvitationRateLimiter();
