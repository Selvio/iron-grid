/**
 * Server-only access to the auth secrets (M5-T1).
 *
 * Mirrors `db/env.ts`: every value is read from the environment **at call time**,
 * never at module load, so importing the auth layer performs no I/O and no test
 * needs a live secret. Only the backend reads these; `game-engine` and
 * `game-data` never do (`architecture.md` §4). The magic-link delivery secrets
 * (`RESEND_API_KEY`, `EMAIL_FROM`) are read by the Resend mailer at send time
 * (M5-T2), so constructing the provider still touches no env.
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

/**
 * Returns the Resend API key used to deliver the magic-link email, throwing if
 * it is absent.
 *
 * Read only when an email is actually sent (`resendMailer`), so tests that fake
 * the mailer never need it.
 *
 * @throws if `RESEND_API_KEY` is unset or empty.
 */
export function requireResendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (key === undefined || key.length === 0) {
    throw new Error(
      "RESEND_API_KEY is not set. The magic-link mailer needs it to deliver " +
        "sign-in email via Resend — see docs/03-architecture/backend.md §7.",
    );
  }
  return key;
}

/**
 * Returns the verified sender identity for magic-link mail, throwing if it is
 * absent.
 *
 * The `EMAIL_FROM` address must be a domain verified in Resend; a missing value
 * would make every sign-in send fail, so it fails loudly instead.
 *
 * @throws if `EMAIL_FROM` is unset or empty.
 */
export function requireEmailFrom(): string {
  const from = process.env.EMAIL_FROM;
  if (from === undefined || from.length === 0) {
    throw new Error(
      "EMAIL_FROM is not set. The magic-link mailer needs a verified sender " +
        "address — see docs/03-architecture/backend.md §7.",
    );
  }
  return from;
}
