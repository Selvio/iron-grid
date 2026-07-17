import { Resend } from "resend";

import { requireEmailFrom, requireResendApiKey } from "../auth/env";
import type { NotificationJobType } from "../db";

/**
 * Gameplay notification delivery (M8-T6).
 *
 * The seam mirrors M5's magic-link `MagicLinkMailer`: an injectable interface
 * with a default Resend implementation that reads `RESEND_API_KEY` / `EMAIL_FROM`
 * **at send time** (`auth/env.ts`), so tests pass a fake and send no real email
 * and importing this module performs no I/O. These are the five **gameplay**
 * triggers (`notifications.event_triggers`), distinct from the transactional
 * magic-link auth mail (M5 §3). Content is minimal here — the branded templates
 * are M9.
 *
 * @see app/server/auth/providers/magic-link.ts
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T6)
 */

/** One notification email to deliver. */
export interface NotificationEmail {
  readonly to: string;
  readonly type: NotificationJobType;
  readonly matchId: string;
}

/** The delivery seam — tests inject a fake to assert sends without a network call. */
export interface NotificationMailer {
  send(email: NotificationEmail): Promise<void>;
}

/** Subject line per trigger. */
const SUBJECTS: Record<NotificationJobType, string> = {
  match_invitation: "Your Iron Grid match is ready",
  turn_started: "It's your turn — Iron Grid",
  turn_reminder: "Your Iron Grid turn is ending soon",
  turn_expired: "Your Iron Grid turn has expired",
  match_completed: "Your Iron Grid match has ended",
};

/** Minimal plain-text body (branded templates are M9). */
function bodyText(type: NotificationJobType, matchId: string): string {
  return `${SUBJECTS[type]}.\n\nMatch: ${matchId}\n\nManage your email preferences in your account.`;
}

/**
 * The production mailer: delivers a notification through Resend. Secrets are read
 * at send time; a Resend-reported error is surfaced so the drain leaves the job
 * pending (retryable). The recipient and match id are the only content — no
 * hidden gameplay state (`security_rules.hidden_state_log_redaction_required`).
 */
export function resendNotificationMailer(): NotificationMailer {
  return {
    async send({ to, type, matchId }) {
      const resend = new Resend(requireResendApiKey());
      const { error } = await resend.emails.send({
        from: requireEmailFrom(),
        to,
        subject: SUBJECTS[type],
        text: bodyText(type, matchId),
      });
      if (error !== null) {
        throw new Error(`Notification delivery failed: ${error.message}`);
      }
    },
  };
}
