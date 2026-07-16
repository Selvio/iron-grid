/**
 * Server-only access to the auth secrets (M5-T1).
 *
 * Mirrors `db/env.ts`: every value is read from the environment **at call time**,
 * never at module load, so importing the auth layer performs no I/O and no test
 * needs a live secret. Only the backend reads these; `game-engine` and
 * `game-data` never do (`architecture.md` §4). The magic-link / Resend secrets
 * (`RESEND_API_KEY`, `EMAIL_FROM`) are added alongside the provider in M5-T2.
 *
 * @see docs/03-architecture/backend.md §7
 * @see app/server/db/env.ts
 */

/**
 * Returns the Auth.js signing secret, throwing if it is absent.
 *
 * Auth.js uses it to sign/verify session and verification tokens; a missing or
 * empty value must fail loudly rather than silently weaken security.
 *
 * @throws if `AUTH_SECRET` is unset or empty.
 */
export function requireAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret === undefined || secret.length === 0) {
    throw new Error(
      "AUTH_SECRET is not set. Auth.js needs a signing secret — see " +
        "docs/03-architecture/backend.md §7.",
    );
  }
  return secret;
}
