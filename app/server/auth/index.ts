import NextAuth from "next-auth";

import { buildAuthConfig } from "./config";

/**
 * Public entry point for the server-only auth layer (M5-T1).
 *
 * Only the backend imports this; the pure packages never do
 * (`architecture.md` §4) — the `forbidden-import` guard test enforces that
 * boundary for `server/auth` just as it does for `server/db`.
 *
 * `NextAuth` is given `buildAuthConfig` in its **lazy** form: the function is
 * invoked per request, so constructing this module reads no env and opens no
 * connection. `handlers` mount the `/api/auth/*` routes; `auth` resolves the
 * session (used by the M5-T3 current-user helper); `signIn` / `signOut` drive
 * the magic-link flow wired in M5-T2 (sign-out needs no bespoke endpoint).
 *
 * @see docs/03-architecture/backend.md §7
 * @see docs/04-development/milestones/m5-auth.md (M5-T1, T2, T3)
 */
export const { handlers, auth, signIn, signOut } = NextAuth(buildAuthConfig);

export { buildAuthConfig } from "./config";
export {
  requireAuthSecret,
  requireResendApiKey,
  requireEmailFrom,
} from "./env";
export {
  magicLinkProvider,
  resendMailer,
  MAGIC_LINK_PROVIDER_ID,
  type MagicLinkMailer,
  type MagicLinkEmail,
} from "./providers/magic-link";
export {
  getCurrentUser,
  requireUser,
  type AuthenticatedUser,
  type SessionResolver,
} from "./session";
export { requireMatchMembership, type MatchMembership } from "./membership";
export { UnauthenticatedError, MembershipForbiddenError } from "./errors";
