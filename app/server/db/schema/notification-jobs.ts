import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { notificationJobStatus, notificationType } from "./enums";
import { matchPlayers } from "./match-players";
import { matches } from "./matches";

/**
 * `notification_jobs` — durable turn-reminder and expiry jobs (M4-T6).
 *
 * Schema only; the scheduler that drains these (`status`, `scheduled_at`) and the
 * Resend delivery are M8. Notifications are never gameplay-authoritative
 * (`database.md` §5.7, `backend.md` §10).
 *
 * @see docs/03-architecture/database.md §5.7
 * @see docs/02-data/rules.yaml → notifications
 */
export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: uuid().primaryKey().defaultRandom(),
    matchId: text()
      .notNull()
      .references(() => matches.id),
    playerId: text()
      .notNull()
      .references(() => matchPlayers.id),
    type: notificationType().notNull(),
    scheduledAt: timestamp({ withTimezone: true }).notNull(),
    sentAt: timestamp({ withTimezone: true }),
    status: notificationJobStatus().notNull().default("pending"),
  },
  (table) => [
    index("notification_jobs_status_scheduled_at_idx").on(
      table.status,
      table.scheduledAt,
    ),
  ],
);

/** A selected `notification_jobs` row. */
export type NotificationJobRow = typeof notificationJobs.$inferSelect;
/** An insertable `notification_jobs` row. */
export type NewNotificationJobRow = typeof notificationJobs.$inferInsert;
