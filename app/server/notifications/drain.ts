import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { claimDueJobs, markJobCancelled, markJobSent } from "../db";
import { matchPlayers } from "../db/schema/match-players";
import { users } from "../db/schema/users";

import { type NotificationMailer, resendNotificationMailer } from "./mailer";

/**
 * The notification drain (M8-T6).
 *
 * Sends the due `notification_jobs` through an injected mailer and transitions
 * each `pending → sent`/`cancelled`. It runs **outside** any gameplay
 * transaction (`notifications.gameplay_authority: false`): a mailer failure
 * leaves the job `pending` (retried on the next drain), never affecting match
 * state. The recipient's per-user preference toggle
 * (`users.notification_preferences`) gates delivery — a toggled-off job is
 * `cancelled`, not sent. Invoked by the cron route (M8-T6).
 *
 * @see docs/03-architecture/backend.md §10
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T6)
 */

/** How a drain pass resolved. */
export interface DrainResult {
  readonly sent: number;
  readonly cancelled: number;
  readonly failed: number;
}

export interface DrainDeps<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
> {
  readonly db: PgDatabase<TQuery, TSchema>;
  /** Delivery seam; defaults to the Resend mailer. */
  readonly mailer?: NotificationMailer;
  /** Clock (injected in tests); defaults to now. */
  readonly now?: () => Date;
  /** Max jobs to drain in one pass. */
  readonly limit?: number;
}

/** Delivers due pending jobs, honoring per-recipient preferences. */
export async function drainNotifications<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(deps: DrainDeps<TQuery, TSchema>): Promise<DrainResult> {
  const now = deps.now?.() ?? new Date();
  const mailer = deps.mailer ?? resendNotificationMailer();
  const jobs = await claimDueJobs(deps.db, now, deps.limit ?? 100);

  let sent = 0;
  let cancelled = 0;
  let failed = 0;

  for (const job of jobs) {
    const [recipient] = await deps.db
      .select({
        email: users.email,
        preferences: users.notificationPreferences,
      })
      .from(matchPlayers)
      .innerJoin(users, eq(matchPlayers.userId, users.id))
      .where(eq(matchPlayers.id, job.playerId));

    // No resolvable recipient (a pending guest slot / vanished user) — drop it.
    if (recipient === undefined) {
      await markJobCancelled(deps.db, job.id);
      cancelled += 1;
      continue;
    }
    // The recipient turned this trigger off — cancel rather than send.
    if (!recipient.preferences[job.type]) {
      await markJobCancelled(deps.db, job.id);
      cancelled += 1;
      continue;
    }

    try {
      await mailer.send({
        to: recipient.email,
        type: job.type,
        matchId: job.matchId,
      });
      await markJobSent(deps.db, job.id, now);
      sent += 1;
    } catch {
      // Leave the job pending — the next drain retries it.
      failed += 1;
    }
  }

  return { sent, cancelled, failed };
}
