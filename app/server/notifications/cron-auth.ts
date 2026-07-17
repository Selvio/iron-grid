import { timingSafeEqual } from "node:crypto";

import { requireCronSecret } from "../auth/env";

/**
 * Authorizes a call to the notification cron drain (M8-T6).
 *
 * The scheduled invoker (Vercel Cron) presents `CRON_SECRET` as a bearer token.
 * The comparison is constant-time (`timingSafeEqual`) so the secret cannot be
 * recovered by timing; a length mismatch or absent header is rejected without a
 * timed compare. Fail-closed: `requireCronSecret` throws when the secret is
 * unset, so the route 500s and the drain never runs unauthenticated.
 *
 * @see app/api/cron/notifications/route.ts
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T6)
 */
export function isCronAuthorized(authorizationHeader: string | null): boolean {
  if (authorizationHeader === null) return false;
  const expected = `Bearer ${requireCronSecret()}`;
  const provided = Buffer.from(authorizationHeader);
  const secret = Buffer.from(expected);
  // timingSafeEqual requires equal-length buffers; a length mismatch is a
  // non-match and its length leak is harmless (the token format is public).
  if (provided.length !== secret.length) return false;
  return timingSafeEqual(provided, secret);
}
