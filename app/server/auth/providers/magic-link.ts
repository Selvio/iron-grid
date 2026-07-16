import type {
  EmailConfig,
  EmailProviderSendVerificationRequestParams,
} from "next-auth/providers/email";
import { Resend } from "resend";

import { requireEmailFrom, requireResendApiKey } from "../env";

/**
 * Magic-link (passwordless email) sign-in provider, delivered by Resend (M5-T2).
 *
 * Auth.js issues and single-use-consumes the token through the `verification_tokens`
 * table (M4-T2) via the Drizzle adapter; this module owns only the **delivery** —
 * an Auth.js `type: "email"` provider whose `sendVerificationRequest` hands the
 * sign-in URL to an injectable {@link MagicLinkMailer}. The default mailer talks
 * to Resend; tests pass a fake so no real email is sent (`m5-auth.md` §3).
 *
 * This is **transactional auth mail**, not a gameplay notification — the five
 * `notifications.event_triggers` are scheduled and sent in M8 (`backend.md` §10).
 *
 * Secrets (`RESEND_API_KEY`, `EMAIL_FROM`) are read **at send time** inside
 * `resendMailer`, so importing this module and constructing the provider perform
 * no I/O and read no env (`db/env.ts` discipline).
 *
 * @see docs/03-architecture/backend.md §7
 * @see docs/04-development/milestones/m5-auth.md (M5-T2)
 */

/** Stable provider id; `signIn("magic-link")` and the callback URL key off it. */
export const MAGIC_LINK_PROVIDER_ID = "magic-link";

/** Link lifetime, mirrored into the `verification_tokens` expiry (24h, spec §26.1). */
const MAGIC_LINK_MAX_AGE_SECONDS = 24 * 60 * 60;

/** A sign-in email to deliver: the recipient and the one-time link to embed. */
export interface MagicLinkEmail {
  /** The address that requested sign-in (the token `identifier`). */
  readonly to: string;
  /** The Auth.js callback URL carrying the single-use token. */
  readonly url: string;
}

/**
 * The delivery seam. The provider depends on this interface, not on Resend, so
 * tests inject a fake and assert the send without a network call (`m5-auth.md` §3).
 */
export interface MagicLinkMailer {
  send(email: MagicLinkEmail): Promise<void>;
}

/** Subject line for the transactional sign-in email. */
const SIGN_IN_SUBJECT = "Sign in to Iron Grid";

/** Minimal HTML body — the branded sign-in surface is M9 (`m5-auth.md` §3). */
function signInHtml(url: string): string {
  return [
    `<p>Sign in to <strong>Iron Grid</strong> by following this link:</p>`,
    `<p><a href="${url}">Sign in</a></p>`,
    `<p>If you did not request this email you can safely ignore it. The link expires in 24 hours.</p>`,
  ].join("");
}

/** Plain-text fallback for clients that do not render HTML. */
function signInText(url: string): string {
  return `Sign in to Iron Grid:\n${url}\n\nIf you did not request this email you can safely ignore it. The link expires in 24 hours.`;
}

/**
 * The production mailer: delivers the sign-in email through Resend.
 *
 * The API key and sender identity are resolved from typed env **at send time**,
 * and a Resend-reported error is surfaced as a thrown `Error` so the sign-in
 * flow fails loudly. The address and URL are never logged — the link is a
 * bearer credential (`security_rules.hidden_state_log_redaction_required`).
 */
export function resendMailer(): MagicLinkMailer {
  return {
    async send({ to, url }) {
      const resend = new Resend(requireResendApiKey());
      const { error } = await resend.emails.send({
        from: requireEmailFrom(),
        to,
        subject: SIGN_IN_SUBJECT,
        html: signInHtml(url),
        text: signInText(url),
      });
      if (error !== null) {
        throw new Error(`Magic-link email delivery failed: ${error.message}`);
      }
    },
  };
}

/**
 * Builds the Auth.js magic-link provider, registered in `buildAuthConfig` (T1).
 *
 * The mailer is injectable and defaults to {@link resendMailer}; the whole email
 * body/delivery lives behind `sendVerificationRequest` so the token issuance and
 * single-use consumption stay the adapter's job.
 */
export function magicLinkProvider(
  mailer: MagicLinkMailer = resendMailer(),
): EmailConfig {
  return {
    id: MAGIC_LINK_PROVIDER_ID,
    type: "email",
    name: "Email",
    maxAge: MAGIC_LINK_MAX_AGE_SECONDS,
    async sendVerificationRequest({
      identifier,
      url,
    }: EmailProviderSendVerificationRequestParams) {
      await mailer.send({ to: identifier, url });
    },
    options: {},
  };
}
