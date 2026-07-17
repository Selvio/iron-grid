import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import {
  type NewNotificationJobRow,
  type NotificationJobRow,
  notificationJobs,
} from "../schema/notification-jobs";

/**
 * `notification_jobs` writers and the drain reader (M8-T4).
 *
 * Enqueue is idempotent per turn via `unique(match_id, player_id, type,
 * dedupe_key)` + `onConflictDoNothing`; the cron drain (`M8-T6`) reads due
 * `pending` jobs by the `(status, scheduled_at)` index, delivers, and marks
 * `sent`/`cancelled`. Notifications are never gameplay-authoritative — these run
 * outside the action transaction (`database.md` §5.7, `backend.md` §10).
 *
 * @see docs/03-architecture/database.md §5.7
 * @see docs/04-development/milestones/m8-async-notifications.md (M8-T4)
 */

/** A `notification_jobs.type`. */
export type NotificationJobType = NotificationJobRow["type"];

/** A job to enqueue; `status`/`sentAt` default to pending/null. */
export type EnqueueNotificationJob = Omit<
  NewNotificationJobRow,
  "id" | "status" | "sentAt"
>;

/**
 * Enqueues a notification job, or no-ops if the same `(match, player, type,
 * dedupeKey)` is already queued — idempotent scheduling.
 */
export async function enqueueNotificationJob<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: PgDatabase<TQuery, TSchema>, job: EnqueueNotificationJob): Promise<void> {
  await db.insert(notificationJobs).values(job).onConflictDoNothing();
}

/**
 * Returns the due `pending` jobs (`scheduled_at ≤ now`) in schedule order, up to
 * `limit` — the drain's work list. (Single-instance MVP; cross-instance
 * `SKIP LOCKED` claiming is deferred, `m8` §6.)
 */
export async function claimDueJobs<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  now: Date,
  limit: number,
): Promise<NotificationJobRow[]> {
  return db
    .select()
    .from(notificationJobs)
    .where(
      and(
        eq(notificationJobs.status, "pending"),
        lte(notificationJobs.scheduledAt, now),
      ),
    )
    .orderBy(asc(notificationJobs.scheduledAt))
    .limit(limit);
}

/** Marks a delivered job `sent`. */
export async function markJobSent<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: PgDatabase<TQuery, TSchema>, id: string, sentAt: Date): Promise<void> {
  await db
    .update(notificationJobs)
    .set({ status: "sent", sentAt })
    .where(eq(notificationJobs.id, id));
}

/** Marks a job `cancelled` (e.g. a toggled-off recipient at drain time). */
export async function markJobCancelled<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(db: PgDatabase<TQuery, TSchema>, id: string): Promise<void> {
  await db
    .update(notificationJobs)
    .set({ status: "cancelled" })
    .where(eq(notificationJobs.id, id));
}

/**
 * Cancels the still-`pending` jobs of the given types for one player of a match —
 * used on turn hand-off to drop the prior turn's reminder/expired jobs
 * (`time_model` / `notifications`).
 */
export async function cancelPendingJobs<
  TQuery extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<TQuery, TSchema>,
  matchId: string,
  playerId: string,
  types: readonly NotificationJobType[],
): Promise<void> {
  if (types.length === 0) return;
  await db
    .update(notificationJobs)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(notificationJobs.matchId, matchId),
        eq(notificationJobs.playerId, playerId),
        eq(notificationJobs.status, "pending"),
        inArray(notificationJobs.type, [...types]),
      ),
    );
}
