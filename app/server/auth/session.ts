import type { DefaultSession, Session } from "next-auth";

import { UnauthenticatedError } from "./errors";

/**
 * Session resolution and the current-user server helper (M5-T3).
 *
 * `getCurrentUser` resolves the Auth.js database session to the authenticated
 * user (or `null`); `requireUser` is the `authenticate_player` primitive the M7
 * action pipeline composes — it returns the user or raises the typed 401. Both
 * run on the Node.js runtime, where `auth()` can reach the session cookie and the
 * adapter (`backend.md` §2, §7).
 *
 * The session source is injectable (defaulting to Auth.js `auth`) so tests drive
 * resolution with a seeded session and no HTTP request. No token is read onto the
 * returned value or logged (`security_rules.hidden_state_log_redaction_required`).
 *
 * @see docs/03-architecture/backend.md §7
 * @see docs/03-architecture/domain-model.md §5
 * @see docs/04-development/milestones/m5-auth.md (M5-T3)
 */

// Expose the stable `user.id` on the session type. The `session` callback in
// `config.ts` populates it from the adapter user; this augmentation makes it
// visible to `getCurrentUser` and every downstream membership check.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

/** The authenticated identity a session resolves to (`domain-model.md` §5). */
export interface AuthenticatedUser {
  /** Stable `users.id` — what membership and ownership checks key off. */
  readonly id: string;
  /** The verified sign-in address, or `null` if the session omits it. */
  readonly email: string | null;
  readonly name: string | null;
  readonly image: string | null;
}

/** Resolves the current Auth.js session; the default reads the request cookie. */
export type SessionResolver = () => Promise<Session | null>;

// The default resolver imports the Auth.js instance lazily: constructing it pulls
// in the Next.js server runtime, so deferring the import keeps this module usable
// (and testable) outside a request — callers inject a resolver instead.
const defaultResolver: SessionResolver = async () => {
  const { auth } = await import("./index");
  return auth();
};

/** Maps a resolved session to a user, treating an id-less session as signed out. */
function toAuthenticatedUser(
  session: Session | null,
): AuthenticatedUser | null {
  const user = session?.user;
  if (
    user === undefined ||
    typeof user.id !== "string" ||
    user.id.length === 0
  ) {
    return null;
  }
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
  };
}

/**
 * Resolves the authenticated `User` for the current request, or `null` when no
 * valid session exists.
 */
export async function getCurrentUser(
  resolveSession: SessionResolver = defaultResolver,
): Promise<AuthenticatedUser | null> {
  return toAuthenticatedUser(await resolveSession());
}

/**
 * Returns the authenticated `User` or raises the typed 401 — the
 * `authenticate_player` step the M7 pipeline runs at the head of every mutation.
 */
export async function requireUser(
  resolveSession: SessionResolver = defaultResolver,
): Promise<AuthenticatedUser> {
  const user = await getCurrentUser(resolveSession);
  if (user === null) {
    throw new UnauthenticatedError();
  }
  return user;
}
